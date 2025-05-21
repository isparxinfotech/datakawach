import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Chart, registerables } from 'chart.js';
import * as JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Register Chart.js components
Chart.register(...registerables);

// Interface for OneDrive content items
interface OneDriveItem {
  name: string;
  id: string;
  size: number;
  type: string;
  downloadUrl?: string;
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
  totalStorage: number = 5_000_000_000_000; // 1 TB in bytes
  remainingStorage: number = this.totalStorage;
  nextLink: string = ''; // Store pagination link

  // Rename folder state
  showRenameModal: boolean = false;
  selectedFolder: string = '';
  newFolderName: string = '';
  renameError: string = '';

  // Search and sort state
  searchQuery: string = '';
  sortBy: string = 'name'; // Options: 'name', 'type', 'size'

  // Charts
  private storageChart: Chart<'doughnut', number[], string> | undefined;
  private folderUsageChart: Chart | undefined;

  private subscription?: Subscription;
  private userSubscription?: Subscription;
  totalUsers: number = 0;
  isBlackAndWhiteTheme: boolean = false;
  filteredContents: OneDriveItem[] = []; // Fixed type from never[] to OneDriveItem[]

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private superAdminService: SuperAdminService
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
      }
    } else {
      this.errorMessage = 'User session details are incomplete. Please log in again.';
    }

    // Fetch total corporate users
    this.fetchTotalUsers();
  }

  ngAfterViewInit(): void {
    // Delay chart initialization to ensure DOM is fully rendered
    setTimeout(() => {
      this.initializeCharts();
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
      return;
    }

    this.userSessionDetails.userType = 5;
    this.userSubscription = this.superAdminService.getUsersList(this.userSessionDetails).subscribe({
      next: (response) => {
        if (response && response.userInfo && Array.isArray(response.userInfo)) {
          this.totalUsers = response.userInfo.length;
        } else {
          this.errorMessage = 'Failed to fetch user count: Invalid response from server.';
          this.totalUsers = 0;
        }
      },
      error: (err) => {
        this.errorMessage = 'Failed to fetch user count. Please try again later.';
        this.totalUsers = 0;
        console.error('Error fetching user list:', err);
      }
    });
  }

  toggleTheme(): void {
    this.isBlackAndWhiteTheme = !this.isBlackAndWhiteTheme;
    this.updateStorageChart();
    this.initFolderUsageChart();
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
      return;
    }
    const newPath = pathSegments.slice(0, index + 1).join('/');
    this.pathHistory = this.pathHistory.slice(0, index);
    this.currentPath = newPath;
    this.nextLink = '';
    this.loadFolderContents(newPath);
  }

  async downloadFolder(folderName: string): Promise<void> {
    if (!this.username) {
      this.errorMessage = 'Please provide a username.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    const folderPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    const url = `https://datakavach.com/onedrive/download-folder?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`;

    try {
      const response = await this.http.get<any>(url).toPromise();
      console.log('Download folder response:', response);

      if (!response || response.error) {
        throw new Error(response?.error || 'Invalid response from server.');
      }

      const files = response.files || [];
      if (!Array.isArray(files) || files.length === 0) {
        this.errorMessage = `No files found in folder "${folderPath}".`;
        this.loading = false;
        return;
      }

      const zip = new JSZip();
      let hasFiles = false;
      for (const file of files) {
        if (file.type === 'file' && file.downloadUrl) {
          console.log(`Fetching file: ${file.name}`);
          try {
            const fileResponse = await this.http.get(file.downloadUrl, { responseType: 'blob' }).toPromise();
            if (fileResponse) {
              zip.file(file.name, fileResponse);
              hasFiles = true;
            } else {
              console.warn(`No content received for file: ${file.name}`);
              this.errorMessage += `Skipped ${file.name} (no content). `;
            }
          } catch (err: any) {
            console.error(`Failed to fetch file ${file.name}:`, err);
            this.errorMessage += `Failed to include ${file.name} in ZIP. `;
          }
        }
      }

      if (!hasFiles) {
        this.errorMessage = this.errorMessage || `No valid files were included in the ZIP for "${folderPath}".`;
        this.loading = false;
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${folderName}.zip`);
      console.log(`ZIP file created for folder: ${folderPath}`);
      this.successMessage = `Folder "${folderName}" downloaded as ZIP successfully.`;
      this.loading = false;
    } catch (err: any) {
      this.loading = false;
      let errorMessage = err.message || 'Failed to download folder. Please try again.';
      if (err.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.status === 404) {
        errorMessage = `Folder "${folderPath}" not found.`;
      } else if (err.message?.includes('multi-factor authentication')) {
        errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';
      }
      this.errorMessage = errorMessage;
      console.error(`Error downloading folder: ${errorMessage}`, err);
    }
  }

  openRenameModal(folderName: string): void {
    this.selectedFolder = folderName;
    this.newFolderName = folderName;
    this.renameError = '';
    this.successMessage = '';
    this.showRenameModal = true;
  }

  closeRenameModal(): void {
    this.showRenameModal = false;
    this.selectedFolder = '';
    this.newFolderName = '';
    this.renameError = '';
  }

  async renameFolder(): Promise<void> {
    if (!this.username || !this.newFolderName.trim()) {
      this.renameError = 'Please provide a valid folder name.';
      return;
    }

    const folderPath = this.currentPath ? `${this.currentPath}/${this.selectedFolder}` : this.selectedFolder;
    const url = `https://datakavach.com/onedrive/rename-folder?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}&newFolderName=${encodeURIComponent(this.newFolderName)}`;

    this.loading = true;
    this.renameError = '';
    this.successMessage = '';

    try {
      const response = await this.http.patch<any>(url, {}, { observe: 'response' }).toPromise();
      if (response && response.status >= 200 && response.status < 300) {
        this.closeRenameModal();
        this.loadFolderContents(this.currentPath);
        this.successMessage = response.body?.message || 'Folder renamed successfully.';
        console.log(`Folder renamed: ${folderPath} to ${this.newFolderName}`);
      } else {
        throw new Error(`Unexpected response: ${response ? response.status : 'undefined'}`);
      }
      this.loading = false;
    } catch (err: any) {
      this.loading = false;
      let errorMessage = err.error?.message || err.message || 'Failed to rename folder. Please try again.';
      if (err.status === 401) {
        errorMessage = 'Authentication failed. Please log in again.';
      } else if (err.status === 404) {
        errorMessage = `Folder "${folderPath}" not found.`;
      } else if (err.error?.message?.includes('multi-factor authentication')) {
        errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';
      }
      this.renameError = errorMessage;
    }
  }

  private loadFolderContents(folderPath: string): void {
    if (!this.username) {
      this.errorMessage = 'Please provide a username.';
      this.loading = false;
      this.oneDriveContents = [];
      this.filteredContents = [];
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.oneDriveContents = [];
    this.filteredContents = [];
    this.totalSize = 0;

    const url = folderPath
      ? `https://datakavach.com/onedrive/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`
      : `https://datakavach.com/onedrive/folders?username=${encodeURIComponent(this.username)}`;

    console.log(`Loading contents for folder path: ${folderPath || 'root'} (URL: ${url})`);

    this.subscription = this.http.get<any>(url).subscribe({
      next: (response) => {
        console.log('Folder contents response:', response, 'Type:', typeof response);
        if (response && response.error) {
          let errorMessage = response.error || 'Error fetching folder contents.';
          if (response.error?.includes('multi-factor authentication')) {
            errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';
          }
          this.errorMessage = errorMessage;
          this.loading = false;
          this.oneDriveContents = [];
          this.filteredContents = [];
          return;
        }

        let items: any[] = [];
        if (folderPath) {
          items = response.contents || [];
          this.nextLink = response.nextLink || '';
        } else {
          items = response.folders || [];
          this.nextLink = response.nextLink || '';
        }

        if (!Array.isArray(items)) {
          this.errorMessage = `Invalid response format from server. Expected an array of items. Received: ${JSON.stringify(response, null, 2)}`;
          console.error('Invalid response:', response);
          this.loading = false;
          this.oneDriveContents = [];
          this.filteredContents = [];
          return;
        }

        this.oneDriveContents = items.map(item => ({
          name: item.name || 'Unknown',
          id: item.id || 'N/A',
          size: item.size || 0,
          type: item.type || 'folder', // Default to 'folder' if type is missing
          downloadUrl: item.downloadUrl
        }));
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
        console.log('Processed oneDriveContents:', this.oneDriveContents, 'NextLink:', this.nextLink);
      },
      error: (err) => {
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
        this.filteredContents = [];
        console.error(`Error loading folder contents: ${errorMessage}`, err);
      }
    });
  }

  updateStorageChart(): void {
    const ctx = document.getElementById('storageChart') as HTMLCanvasElement;
    if (!ctx) {
      console.error('Storage chart canvas not found');
      return;
    }

    console.log('Initializing storage chart...');
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
      console.log('Storage chart initialized successfully');
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

    console.log('Initializing folder usage chart...');
    if (this.folderUsageChart) {
      this.folderUsageChart.destroy();
    }

    const folders = this.filteredContents.filter(item => item.type === 'folder');
    const folderNames = folders.map(folder => folder.name);
    const folderSizes = folders.map(folder => folder.size / (1024 * 1024)); // Convert to MB

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
      console.log('Folder usage chart initialized successfully');
    } catch (error) {
      console.error('Error initializing folder usage chart:', error);
    }
  }

  // Method to check if there are any folders
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
  }

  ngOnDestroy(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
    if (this.storageChart) {
      this.storageChart.destroy();
    }
    if (this.folderUsageChart) {
      this.folderUsageChart.destroy();
    }
  }
}