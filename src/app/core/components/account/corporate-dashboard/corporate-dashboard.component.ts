import { Component, OnInit, OnDestroy, AfterViewInit, ChangeDetectorRef } from '@angular/core'; 
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Chart, registerables } from 'chart.js';
import { saveAs } from 'file-saver';

// Register Chart.js components
Chart.register(...registerables);

// Interface for OneDrive content items
interface OneDriveItem {
  name: string;
  id: string;
  size: number;
  type: 'file' | 'folder';
  downloadUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
}

@Component({
  selector: 'app-corporate-dashboard',
  templateUrl: './corporate-dashboard.component.html',
  styleUrls: ['./corporate-dashboard.component.css']
})
export class CorporateDashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  userSessionDetails: userSessionDetails | null | undefined;
  username: string = '';
  cloudProvider: string = '';
  oneDriveContents: OneDriveItem[] = [];
  currentPath: string = '';
  pathHistory: string[] = [];
  loading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  totalSize: number = 0;
  totalStorage: number = 5_000_000_000_000; // 5 TB in bytes
  remainingStorage: number = this.totalStorage;
  nextLink: string = '';

  // Rename folder state
  showRenameModal: boolean = false;
  selectedFolder: string = '';
  newFolderName: string = '';
  renameError: string = '';

  // Share link state
  showShareModal: boolean = false;
  selectedItem: OneDriveItem | null = null;
  shareLink: string = '';
  shareError: string = '';

  // Search and sort state
  searchQuery: string = '';
  sortBy: string = 'name';

  // Charts
  private storageChart: Chart<'doughnut', number[], string> | undefined;
  private folderUsageChart: Chart | undefined;

  private subscriptions: Subscription[] = [];
  totalUsers: number = 0;
  isBlackAndWhiteTheme: boolean = false;
  filteredContents: OneDriveItem[] = [];

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private superAdminService: SuperAdminService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails && this.userSessionDetails.username && this.userSessionDetails.cloudProvider) {
      this.username = this.userSessionDetails.username;
      this.cloudProvider = this.userSessionDetails.cloudProvider.toLowerCase();
      if (this.cloudProvider === 'onedrive') {
        this.listRootFolders();
      } else {
        this.errorMessage = 'Only OneDrive is supported for corporate dashboard.';
        this.cdr.detectChanges();
      }
    } else {
      this.errorMessage = 'User session details are incomplete. Please log in again.';
      this.cdr.detectChanges();
    }

    this.fetchTotalUsers();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.initializeCharts();
      const renameModalElement = document.getElementById('renameModal');
      if (renameModalElement) {
        renameModalElement.addEventListener('hidden.bs.modal', () => {
          this.closeRenameModal();
        });
      }
      const shareModalElement = document.getElementById('shareModal');
      if (shareModalElement) {
        shareModalElement.addEventListener('hidden.bs.modal', () => {
          this.closeShareModal();
        });
      }
      this.cdr.detectChanges();
    }, 0);
  }

  private initializeCharts(): void {
    console.log('Attempting to initialize charts...');
    this.updateStorageChart();
    this.initFolderUsageChart();
  }

  private fetchTotalUsers(): void {
    if (!this.userSessionDetails) {
      this.errorMessage = 'User session details are missing. Cannot fetch user list.';
      this.totalUsers = 0;
      this.cdr.detectChanges();
      return;
    }

    this.userSessionDetails.userType = 5;
    const sub = this.superAdminService.getUsersList(this.userSessionDetails)
      .pipe(
        catchError((err) => {
          this.errorMessage = 'Failed to fetch user count. Please try again later.';
          this.totalUsers = 0;
          console.error('Error fetching user list:', err);
          this.cdr.detectChanges();
          return throwError(() => new Error(this.errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          if (response && response.userInfo && Array.isArray(response.userInfo)) {
            this.totalUsers = response.userInfo.length;
          } else {
            this.errorMessage = 'Failed to fetch user count: Invalid response from server.';
            this.totalUsers = 0;
          }
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  toggleTheme(): void {
    this.isBlackAndWhiteTheme = !this.isBlackAndWhiteTheme;
    this.updateStorageChart();
    this.initFolderUsageChart();
    this.cdr.detectChanges();
  }

  listRootFolders(): void {
    this.currentPath = '';
    this.pathHistory = [];
    this.nextLink = '';
    this.loadFolderContents('');
  }

  listFolderContents(folderName: string): void {
    if (!folderName) {
      this.errorMessage = 'Invalid folder name.';
      this.cdr.detectChanges();
      return;
    }
    const newPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    this.pathHistory.push(this.currentPath);
    this.currentPath = newPath;
    this.nextLink = '';
    this.loadFolderContents(newPath);
  }

  navigateBack(): void {
    const previousPath = this.pathHistory.pop();
    this.currentPath = previousPath || '';
    this.nextLink = '';
    this.loadFolderContents(this.currentPath);
  }

  navigateToPathSegment(index: number): void {
    const pathSegments = this.currentPath.split('/');
    if (index >= pathSegments.length) {
      this.errorMessage = 'Invalid navigation path.';
      this.cdr.detectChanges();
      return;
    }
    const newPath = pathSegments.slice(0, index + 1).join('/');
    this.pathHistory = this.pathHistory.slice(0, index);
    this.currentPath = newPath;
    this.nextLink = '';
    this.loadFolderContents(newPath);
  }

  downloadFolder(folderName: string): void {
    if (!this.username || !folderName) {
      this.errorMessage = 'Invalid folder or user email.';
      console.error('Invalid parameters:', { folderName, username: this.username });
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const folderPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    const url = `https://datakavach.com/cloud/download-folder?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`;

    console.log(`Downloading folder: ${folderPath} (URL: ${url})`);

    const sub = this.http
      .get(url, { headers: this.getAuthHeaders(), responseType: 'blob' })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.message || 'Failed to download folder. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `Folder "${folderPath}" not found.`;
          } else if (err.status === 500) {
            errorMessage = 'Server error. Please contact support.';
          }
          this.errorMessage = errorMessage;
          console.error(`Failed to download folder "${folderPath}": ${errorMessage}`, err);
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          const blob = new Blob([response], { type: 'application/zip' });
          saveAs(blob, `${folderName}.zip`);
          this.successMessage = `Folder "${folderName}" downloaded successfully as ZIP.`;
          console.log(`Folder "${folderName}" downloaded successfully as ZIP.`);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  openRenameModal(folderName: string): void {
    this.selectedFolder = folderName;
    this.newFolderName = folderName;
    this.renameError = '';
    this.successMessage = '';
    this.showRenameModal = true;
    const modalElement = document.getElementById('renameModal');
    if (modalElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Modal) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
      }
    }
    this.cdr.detectChanges();
  }

  closeRenameModal(): void {
    this.showRenameModal = false;
    this.selectedFolder = '';
    this.newFolderName = '';
    this.renameError = '';
    const modalElement = document.getElementById('renameModal');
    if (modalElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Modal) {
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
          modal.hide();
        }
      }
    }
    this.cdr.detectChanges();
  }

  renameFolder(): void {
    if (!this.username || !this.newFolderName.trim()) {
      this.renameError = 'Please enter a valid folder name.';
      this.cdr.detectChanges();
      return;
    }

    const folderPath = this.currentPath ? `${this.currentPath}/${this.selectedFolder}` : this.selectedFolder;
    const url = 'https://datakavach.com/cloud/rename-folder';

    const requestBody = {
      username: this.username,
      folderPath: folderPath,
      newFolderName: this.newFolderName
    };

    this.loading = true;
    this.renameError = '';
    this.successMessage = '';

    const sub = this.http.patch<{ message?: string }>(url, requestBody, { headers: this.getAuthHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.message || 'Failed to rename folder. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `Folder "${folderPath}" not found.`;
          } else if (err.status === 400) {
            errorMessage = err.error.message || 'Invalid request. Please check the folder name and try again.';
          } else if (err.error?.includes('multi-factor authentication')) {
            errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';
          }
          this.renameError = errorMessage;
          console.error(`Error renaming folder "${folderPath}" to "${this.newFolderName}": ${errorMessage}`, err);
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.successMessage = response.message || `Folder "${this.selectedFolder}" renamed to "${this.newFolderName}" successfully.`;
          this.closeRenameModal();
          this.loadFolderContents(this.currentPath);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  openShareModal(item: OneDriveItem): void {
    this.selectedItem = item;
    this.shareLink = '';
    this.shareError = '';
    this.showShareModal = true;
    this.generateShareLink(item);
    const modalElement = document.getElementById('shareModal');
    if (modalElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Modal) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
      }
    }
    this.cdr.detectChanges();
  }

  closeShareModal(): void {
    this.showShareModal = false;
    this.selectedItem = null;
    this.shareLink = '';
    this.shareError = '';
    const modalElement = document.getElementById('shareModal');
    if (modalElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Modal) {
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
          modal.hide();
        }
      }
    }
    this.cdr.detectChanges();
  }

  generateShareLink(item: OneDriveItem): void {
    if (!this.username || !item.name) {
      this.shareError = 'Invalid item or user email.';
      console.error('Invalid parameters:', { itemName: item.name, username: this.username });
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.shareError = '';
    this.successMessage = '';

    const itemPath = this.currentPath ? `${this.currentPath}/${item.name}` : item.name;
    const endpoint = item.type === 'folder' ? 'share-folder' : 'share-file';
    const url = `https://datakavach.com/cloud/${endpoint}`;

    const requestBody = {
      username: this.username,
      folderPath: itemPath
    };

    console.log(`Generating share link for: ${itemPath} (URL: ${url}, Type: ${item.type})`);

    const sub = this.http.post<{ shareLink: string }>(url, requestBody, { headers: this.getAuthHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || 'Failed to generate share link. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `${item.type === 'folder' ? 'Folder' : 'File'} "${itemPath}" not found.`;
          } else if (err.status === 400) {
            errorMessage = err.error.error || 'Invalid request. Please check the item and try again.';
          } else if (err.status === 500) {
            errorMessage = 'Server error. Please contact support.';
          }
          this.shareError = errorMessage;
          console.error(`Failed to generate share link for "${itemPath}": ${errorMessage}`, err);
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.shareLink = response.shareLink;
          this.successMessage = `Share link for "${item.name}" generated successfully.`;
          console.log(`Share link for "${item.name}" generated: ${this.shareLink}`);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  copyShareLink(): void {
    const shareLinkInput = document.getElementById('shareLink') as HTMLInputElement;
    if (shareLinkInput) {
      shareLinkInput.select();
      document.execCommand('copy');
      this.successMessage = 'Share link copied to clipboard!';
      this.cdr.detectChanges();
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.userSessionDetails?.jwtToken || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
  }

  private loadFolderContents(folderPath: string): void {
    if (!this.username) {
      this.errorMessage = 'Please provide a username.';
      this.loading = false;
      this.oneDriveContents = [];
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.oneDriveContents = [];
    this.filteredContents = [];
    this.totalSize = 0;

    const url = folderPath
      ? `https://datakavach.com/cloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`
      : `https://datakavach.com/cloud/folders?username=${encodeURIComponent(this.username)}`;

    console.log(`Loading contents for folder path: ${folderPath || 'root'} (URL: ${url})`);

    const sub = this.http.get<{ contents?: OneDriveItem[], folders?: OneDriveItem[], nextLink?: string }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || 'Failed to list contents. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `The folder "${folderPath || 'root'}" does not exist in your OneDrive.`;
          } else if (err.error?.error?.includes('multi-factor authentication')) {
            errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';
          }
          this.errorMessage = errorMessage;
          this.oneDriveContents = [];
          console.error(`Error loading folder contents: ${errorMessage}`, err);
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Raw API response:', response); // Debug raw response
          let items: OneDriveItem[] = [];
          if (folderPath) {
            items = response.contents || [];
          } else {
            items = response.folders || [];
          }

          if (!Array.isArray(items)) {
            this.errorMessage = `Invalid response format from server. Expected an array of items.`;
            console.error('Invalid response:', response);
            this.loading = false;
            this.oneDriveContents = [];
            this.cdr.detectChanges();
            return;
          }

          this.oneDriveContents = items.map(item => {
            const transformedUrl = item.thumbnailUrl
              ? `https://datakavach.com/cloud/thumbnail?username=${encodeURIComponent(this.username)}&thumbnailUrl=${encodeURIComponent(item.thumbnailUrl)}`
              : undefined;
            console.log(`Item: ${item.name}, Original thumbnailUrl: ${item.thumbnailUrl}, Transformed URL: ${transformedUrl}`); // Debug each item
            return {
              name: item.name || 'Unknown',
              id: item.id || 'N/A',
              size: item.size || 0,
              type: item.type || 'folder',
              downloadUrl: item.downloadUrl,
              thumbnailUrl: transformedUrl,
              mimeType: item.mimeType
            };
          });
          console.log('Mapped oneDriveContents:', this.oneDriveContents);
          this.totalSize = this.oneDriveContents.reduce((sum, item) => sum + (item.size || 0), 0);
          this.remainingStorage = this.totalStorage - this.totalSize;
          this.filteredContents = [...this.oneDriveContents];
          this.sortContents();
          this.loading = false;
          this.updateStorageChart();
          this.initFolderUsageChart();
          if (this.oneDriveContents.length === 0) {
            this.errorMessage = `No items found in ${folderPath || 'root'}.`;
          }

          this.nextLink = '';
          if (response.nextLink) {
            const baseUrl = folderPath
              ? `https://datakavach.com/cloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`
              : `https://datakavach.com/cloud/folders?username=${encodeURIComponent(this.username)}`;
            this.nextLink = `${baseUrl}&nextLink=${encodeURIComponent(response.nextLink)}`;
          }

          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  loadMoreContents(): void {
    if (!this.nextLink || this.loading) {
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const sub = this.http.get<{ contents?: OneDriveItem[], folders?: OneDriveItem[], nextLink?: string }>(this.nextLink, { headers: this.getAuthHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || 'Failed to load more contents. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `No more contents available.`;
          }
          this.errorMessage = errorMessage;
          console.error(`Error loading more contents: ${errorMessage}`, err);
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Raw API response for more contents:', response); // Debug raw response
          let items: OneDriveItem[] = response.contents || response.folders || [];

          if (!Array.isArray(items)) {
            this.errorMessage = `Invalid response format from server. Expected an array of items.`;
            console.error('Invalid response:', response);
            this.loading = false;
            this.cdr.detectChanges();
            return;
          }

          const newItems = items.map(item => {
            const transformedUrl = item.thumbnailUrl
              ? `https://datakavach.com/cloud/thumbnail?username=${encodeURIComponent(this.username)}&thumbnailUrl=${encodeURIComponent(item.thumbnailUrl)}`
              : undefined;
            console.log(`Item: ${item.name}, Original thumbnailUrl: ${item.thumbnailUrl}, Transformed URL: ${transformedUrl}`); // Debug each item
            return {
              name: item.name || 'Unknown',
              id: item.id || 'N/A',
              size: item.size || 0,
              type: item.type || 'folder',
              downloadUrl: item.downloadUrl,
              thumbnailUrl: transformedUrl,
              mimeType: item.mimeType
            };
          });

          this.oneDriveContents = [...this.oneDriveContents, ...newItems];
          this.totalSize = this.oneDriveContents.reduce((sum, item) => sum + (item.size || 0), 0);
          this.remainingStorage = this.totalStorage - this.totalSize;
          this.filteredContents = [...this.oneDriveContents];
          this.sortContents();
          this.loading = false;
          this.updateStorageChart();
          this.initFolderUsageChart();
          console.log('Loaded more contents:', newItems);

          this.nextLink = '';
          if (response.nextLink) {
            const baseUrl = this.currentPath
              ? `https://datakavach.com/cloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(this.currentPath)}`
              : `https://datakavach.com/cloud/folders?username=${encodeURIComponent(this.username)}`;
            this.nextLink = `${baseUrl}&nextLink=${encodeURIComponent(response.nextLink)}`;
          }

          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  updateStorageChart(): void {
    const ctx = document.getElementById('storageChart') as HTMLCanvasElement;
    if (!ctx) {
      console.error('Storage chart canvas not found');
      return;
    }

    if (this.storageChart) {
      this.storageChart.destroy();
    }

    try {
      this.storageChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Used Storage', 'Remaining Storage'],
          datasets: [{
            data: [this.totalSize, this.remainingStorage],
            backgroundColor: this.isBlackAndWhiteTheme ? ['#666', '#ccc'] : ['#007bff', '#e9ecef'],
            borderColor: this.isBlackAndWhiteTheme ? ['#333', '#999'] : ['#0056b3', '#ced4da'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                font: {
                  size: 12,
                  weight: 'bold'
                },
                color: this.isBlackAndWhiteTheme ? '#333' : '#1e293b'
              }
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  const label = context.label || '';
                  const value = context.raw as number;
                  return `${label}: ${this.formatSize(value)}`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error initializing storage chart:', error);
    }
  }

  initFolderUsageChart(): void {
    const ctx = document.getElementById('folderUsageChart') as HTMLCanvasElement;
    if (!ctx) {
      console.error('Folder usage chart canvas not found');
      return;
    }

    if (this.folderUsageChart) {
      this.folderUsageChart.destroy();
    }

    const folders = this.filteredContents.filter(item => item.type === 'folder');
    const folderNames = folders.map(folder => folder.name);
    const folderSizes = folders.map(folder => folder.size / (1024 * 1024));

    try {
      this.folderUsageChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: folderNames,
          datasets: [{
            label: 'Storage Used (MB)',
            data: folderSizes,
            backgroundColor: this.isBlackAndWhiteTheme ? ['#666'] : ['#007bff'],
            borderColor: this.isBlackAndWhiteTheme ? ['#333'] : ['#0056b3'],
            borderWidth: 1
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Storage (MB)',
                color: this.isBlackAndWhiteTheme ? '#333' : '#1e293b'
              },
              ticks: {
                color: this.isBlackAndWhiteTheme ? '#333' : '#1e293b'
              },
              grid: {
                color: this.isBlackAndWhiteTheme ? '#ccc' : '#e9ecef'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Folders',
                color: this.isBlackAndWhiteTheme ? '#333' : '#1e293b'
              },
              ticks: {
                color: this.isBlackAndWhiteTheme ? '#333' : '#1e293b'
              },
              grid: {
                display: false
              }
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.raw} MB`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error initializing folder usage chart:', error);
    }
  }

  hasFolders(): boolean {
    return this.filteredContents.some(item => item.type === 'folder');
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  filterContents(): void {
    this.filteredContents = this.oneDriveContents.filter(item =>
      item.name.toLowerCase().includes(this.searchQuery.toLowerCase())
    );
    this.sortContents();
    this.initFolderUsageChart();
    this.cdr.detectChanges();
  }

  sortContents(): void {
    this.filteredContents.sort((a, b) => {
      if (this.sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (this.sortBy === 'type') {
        return a.type.localeCompare(b.type);
      } else if (this.sortBy === 'size') {
        return a.size - b.size;
      }
      return 0;
    });
    this.initFolderUsageChart();
    this.cdr.detectChanges();
  }

  onImgError(event: Event, item: OneDriveItem): void {
    console.error(`Failed to load thumbnail for ${item.name} (${item.type}) at URL: ${item.thumbnailUrl}`, event);
    const imgElement = event.target as HTMLImageElement;
    imgElement.src = 'assets/images/default-file.png'; // Fallback image
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.storageChart) {
      this.storageChart.destroy();
    }
    if (this.folderUsageChart) {
      this.folderUsageChart.destroy();
    }
  }
}