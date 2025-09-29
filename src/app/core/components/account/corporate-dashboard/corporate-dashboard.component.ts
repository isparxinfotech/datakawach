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
  isHovered?: boolean;
  previewUrl?: string;
  previewDuration?: number;
  previewItems?: OneDriveItem[];
  previewError?: string;
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
  previewToastMessage: string = '';

  showRenameModal: boolean = false;
  selectedFolder: string = '';
  newFolderName: string = '';
  renameError: string = '';

  showShareModal: boolean = false;
  selectedItem: OneDriveItem | null = null;
  shareLink: string = '';
  shareError: string = '';

  searchQuery: string = '';
  sortBy: string = 'name';

  createdDateTime: string | null = null;
  expirationDate: string | null = null;
  daysLeft: number | null = null;

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
        this.fetchUserCreatedDateTime();
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

  private fetchUserCreatedDateTime(): void {
    if (!this.username) {
      this.errorMessage = 'Username is missing. Cannot fetch created date time.';
      this.cdr.detectChanges();
      return;
    }

    const url = `https://datakavach.com/isparxcloud/user-created-date?username=${encodeURIComponent(this.username)}`; // Update to https://api.datakavach.com/isparxcloud for production

    const sub = this.http.get<{ createdDateTime?: string }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.errorMessage = err.error?.error || 'Failed to fetch user created date time.';
          console.error('Error fetching user created date time:', err);
          this.cdr.detectChanges();
          return throwError(() => new Error(this.errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          if (response.createdDateTime) {
            this.createdDateTime = response.createdDateTime;
            this.calculateExpirationDate();
          } else {
            this.errorMessage = 'Created date time not found in response.';
          }
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  private calculateExpirationDate(): void {
    if (!this.createdDateTime) return;

    const createdDate = new Date(this.createdDateTime);
    const expiration = new Date(createdDate);
    expiration.setFullYear(createdDate.getFullYear() + 1); // Subscription expires after 1 year

    this.expirationDate = expiration.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const today = new Date();
    const timeDiff = expiration.getTime() - today.getTime();
    this.daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24));

    this.cdr.detectChanges();
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

  private showPreviewToast(message: string): void {
    this.previewToastMessage = message;
    const toastElement = document.getElementById('previewToast');
    if (toastElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Toast) {
        const toast = new bootstrap.Toast(toastElement);
        toast.show();
      }
    }
    this.cdr.detectChanges();
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

  private normalizePath(path: string): string {
    return path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
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
    const newPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${folderName}` : folderName);
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

    const folderPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${folderName}` : folderName);
    const url = `https://datakavach.com/isparxcloud/download-folder?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`; // Update to https://api.datakavach.com/isparxcloud for production

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

    const folderPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${this.selectedFolder}` : this.selectedFolder);
    const url = 'https://datakavach.com/isparxcloud/rename-folder'; // Update to https://api.datakavach.com/isparxcloud for production

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

    const itemPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${item.name}` : item.name);
    const endpoint = item.type === 'folder' ? 'share-folder' : 'share-file';
    const url = `https://datakavach.com/isparxcloud/${endpoint}`; // Update to https://api.datakavach.com/isparxcloud for production

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
          if (!response.shareLink || !response.shareLink.includes('token=')) {
            this.shareError = 'Invalid share link received from server.';
            console.error('Invalid share link:', response.shareLink);
            this.loading = false;
            this.cdr.detectChanges();
            return;
          }
          this.shareLink = response.shareLink; // Use backend-provided URL directly
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

  isImage(item: OneDriveItem): boolean {
    return item.mimeType?.startsWith('image/') || 
           item.name.toLowerCase().match(/\.(png|jpg|jpeg|gif|bmp)$/i) !== null;
  }

  isVideo(item: OneDriveItem): boolean {
    return item.mimeType?.startsWith('video/') || 
           item.name.toLowerCase().match(/\.(mp4|avi|mov|wmv)$/i) !== null;
  }

  fetchFolderPreview(folderName: string, item: OneDriveItem): void {
    if (!this.username) {
      this.errorMessage = 'Please provide a username.';
      this.cdr.detectChanges();
      return;
    }

    const folderPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${folderName}` : folderName);
    const url = `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`; // Update to https://api.datakavach.com/isparxcloud for production

    console.log(`Fetching folder preview for: ${folderPath} (URL: ${url})`);

    const sub = this.http.get<{ contents?: OneDriveItem[] }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          console.error(`Failed to fetch preview for folder "${folderPath}":`, err);
          item.previewItems = [];
          item.previewError = err.status === 404 ? `Folder "${folderName}" not found.` : 'Failed to fetch folder preview.';
          this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
          this.cdr.detectChanges();
          return throwError(() => new Error(item.previewError));
        })
      )
      .subscribe({
        next: (response) => {
          const items = response.contents || [];
          item.previewItems = items
            .filter(i => this.isImage(i) || this.isVideo(i))
            .slice(0, 3)
            .map(i => {
              const filePath = this.normalizePath(`${folderPath}/${i.name}`);
              const previewUrl = this.isVideo(i)
                ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}` // Update to https://api.datakavach.com/isparxcloud for production
                : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`; // Update to https://api.datakavach.com/isparxcloud for production
              console.log(`Constructed preview URL for ${i.name}: ${previewUrl}`);
              return {
                ...i,
                previewUrl,
                previewDuration: this.isVideo(i) ? 5 : undefined,
                isHovered: false,
                previewError: undefined
              };
            });

          // Verify video previews
          item.previewItems.forEach((previewItem, index) => {
            if (this.isVideo(previewItem) && previewItem.previewUrl) {
              const checkUrl = previewItem.previewUrl;
              const checkSub = this.http.head(checkUrl, { headers: this.getAuthHeaders() })
                .pipe(
                  retry({ count: 2, delay: 1000 }),
                  catchError((err) => {
                    previewItem.previewError = err.status === 404 ? `Video "${previewItem.name}" not found.` : 'Failed to verify video preview.';
                    this.showPreviewToast(previewItem.previewError); // Safe: previewItem.previewError is set to a string
                    console.error(`Preflight check failed for ${previewItem.name}:`, err);
                    this.cdr.detectChanges();
                    return throwError(() => new Error(previewItem.previewError));
                  })
                )
                .subscribe({
                  next: () => {
                    console.log(`Preflight check passed for ${previewItem.name}`);
                    if (index === 0 && item.isHovered) {
                      setTimeout(() => {
                        this.cdr.detectChanges(); // Ensure DOM is updated
                        this.playVideoPreview(item, index);
                      }, 100);
                    }
                  }
                });
              this.subscriptions.push(checkSub);
            }
          });

          if (item.previewItems.length > 0 && !item.previewItems[0].previewError) {
            item.previewUrl = item.previewItems[0].previewUrl;
            item.previewDuration = item.previewItems[0].previewDuration;
            item.previewError = undefined;
          } else {
            item.previewError = item.previewItems.length > 0 ? item.previewItems[0].previewError : 'No previewable items in folder.';
            this.showPreviewToast(item.previewError || 'No previewable items available.'); // Fallback to string
          }
          console.log(`Fetched preview items for ${folderName}:`, item.previewItems);
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  onThumbnailHover(item: OneDriveItem): void {
    if (item.isHovered) return;
    item.isHovered = true;
    item.previewError = undefined;

    console.log(`Hovering over item: ${item.name}, Type: ${item.type}, MIME: ${item.mimeType}, ID: ${item.id}`);

    if (item.type === 'folder') {
      this.fetchFolderPreview(item.name, item);
    } else if (this.isImage(item) || this.isVideo(item)) {
      const filePath = this.normalizePath(this.currentPath ? `${this.currentPath}/${item.name}` : item.name);
      console.log(`Constructing preview for ${item.name}: filePath=${filePath}, username=${this.username}`);
      item.previewDuration = this.isVideo(item) ? 5 : undefined;
      item.previewUrl = this.isVideo(item)
        ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}` // Update to https://api.datakavach.com/isparxcloud for production
        : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`; // Update to https://api.datakavach.com/isparxcloud for production
      console.log(`Preview URL for ${item.name}: ${item.previewUrl}`);

      if (!item.previewUrl) {
        item.previewError = 'No preview URL available.';
        this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
        console.warn(`No preview URL for ${item.name}`);
        this.cdr.detectChanges();
        return;
      }

      // Trigger change detection to render video/image element
      this.cdr.detectChanges();

      // Perform preflight check for videos
      if (this.isVideo(item)) {
        const checkUrl = item.previewUrl;
        console.log(`Performing preflight check for ${item.name} at URL: ${checkUrl}`);
        const sub = this.http.head(checkUrl, { headers: this.getAuthHeaders() })
          .pipe(
            retry({ count: 2, delay: 1000 }),
            catchError((err) => {
              const errorMessage = err.status === 404
                ? `Video "${item.name}" not found at path "${filePath}".`
                : `Failed to verify video preview for "${item.name}": ${err.message || 'Unknown error'}`;
              item.previewError = errorMessage;
              this.showPreviewToast(errorMessage); // Safe: errorMessage is a string
              console.error(`Preflight check failed for ${item.name}:`, {
                status: err.status,
                statusText: err.statusText,
                url: err.url,
                message: err.message,
                filePath,
                username: this.username
              });
              this.cdr.detectChanges();
              return throwError(() => new Error(errorMessage));
            })
          )
          .subscribe({
            next: () => {
              console.log(`Preflight check passed for ${item.name}`);
              // Ensure previewUrl and video element are available
              setTimeout(() => {
                if (!item.previewUrl) {
                  console.warn(`Preview URL is undefined for ${item.name} after preflight check`);
                  item.previewError = 'Preview URL lost after preflight check.';
                  this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
                  this.cdr.detectChanges();
                  return;
                }
                const videoSelector = `#video-preview-${item.id}`;
                const videoElement = document.querySelector(videoSelector) as HTMLVideoElement;
                console.log(`Checking video element for ${item.name}: Selector=${videoSelector}, Found=${!!videoElement}`);
                if (!videoElement) {
                  console.warn(`Video element not found for ${item.name} with selector: ${videoSelector}`);
                  item.previewError = 'Video element not found for preview.';
                  this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
                  this.cdr.detectChanges();
                  return;
                }
                this.playVideoPreview(item, undefined);
              }, 200); // Increased delay to ensure DOM update
            }
          });
        this.subscriptions.push(sub);
      }
    } else {
      item.previewError = 'No preview available for this file type.';
      this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
      console.warn(`No preview for ${item.name}: Unsupported type or missing MIME type`);
      this.cdr.detectChanges();
    }
  }

  onThumbnailLeave(item: OneDriveItem): void {
    if (item.isHovered) {
      item.isHovered = false;
      item.previewItems = item.type === 'folder' ? [] : item.previewItems;
      item.previewError = undefined;
      if (this.isVideo(item) || (item.type === 'folder' && item.previewItems?.some(i => this.isVideo(i)))) {
        const videoSelector = item.type === 'folder' && item.previewItems?.length
          ? `#video-preview-${item.id}-0`
          : `#video-preview-${item.id}`;
        const videoElement = document.querySelector(videoSelector) as HTMLVideoElement;
        if (videoElement) {
          videoElement.pause();
          videoElement.currentTime = 0;
          videoElement.src = ''; // Clear src to prevent memory leaks
        }
      }
      // Only clear previewUrl for folders, not files, to preserve it for subsequent hovers
      if (item.type === 'folder') {
        item.previewUrl = undefined;
      }
      this.cdr.detectChanges();
    }
  }

  private playVideoPreview(item: OneDriveItem, index?: number): void {
    const videoSelector = item.type === 'folder' && index !== undefined
      ? `#video-preview-${item.id}-${index}`
      : `#video-preview-${item.id}`;
    const videoElement = document.querySelector(videoSelector) as HTMLVideoElement;
    const previewUrl = item.type === 'folder' && item.previewItems?.length && index !== undefined
      ? item.previewItems[index].previewUrl
      : item.previewUrl;

    console.log(`Attempting to play video for ${item.name} with selector: ${videoSelector}, Element found: ${!!videoElement}, URL: ${previewUrl}`);

    if (!previewUrl) {
      item.previewError = 'No video preview URL available.';
      this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
      console.warn(`No preview URL for ${item.name}`);
      this.cdr.detectChanges();
      return;
    }

    if (!videoElement) {
      item.previewError = 'Video element not found.';
      this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
      console.warn(`Video element not found for ${item.name} with selector: ${videoSelector}`);
      this.cdr.detectChanges();
      return;
    }

    videoElement.muted = true;
    videoElement.currentTime = 0;
    videoElement.src = previewUrl; // Explicitly set src
    videoElement.load(); // Force reload to ensure src is applied
    videoElement.play().catch(err => {
      item.previewError = err.status === 404 ? `Video "${item.name}" not found.` : `Failed to play video preview: ${err.message || 'Unknown error'}`;
      this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
      console.error(`Failed to play video preview for ${item.name}:`, err);
      this.cdr.detectChanges();
      setTimeout(() => {
        videoElement.src = previewUrl; // Reassign src for retry
        videoElement.load();
        videoElement.play().catch(err2 => {
          item.previewError = `Video playback failed after retry: ${err2.message || 'Unknown error'}`;
          this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
          console.error(`Retry failed for ${item.name}:`, err2);
          this.cdr.detectChanges();
        });
      }, 50);
    });
    setTimeout(() => {
      if (item.isHovered && videoElement) {
        videoElement.pause();
        videoElement.currentTime = 0;
        videoElement.src = ''; // Clear src to prevent memory leaks
        item.isHovered = false;
        if (item.type === 'folder') {
          item.previewItems = [];
          item.previewUrl = undefined;
        }
        item.previewError = undefined;
        this.cdr.detectChanges();
      }
    }, (item.previewDuration || 5) * 1000);
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

    const normalizedFolderPath = this.normalizePath(folderPath);
    const url = normalizedFolderPath
      ? `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(normalizedFolderPath)}` // Update to https://api.datakavach.com/isparxcloud for production
      : `https://datakavach.com/isparxcloud/folders?username=${encodeURIComponent(this.username)}`; // Update to https://api.datakavach.com/isparxcloud for production

    console.log(`Loading contents for folder path: ${normalizedFolderPath || 'root'} (URL: ${url})`);

    const sub = this.http.get<{ contents?: OneDriveItem[], folders?: OneDriveItem[], nextLink?: string }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || 'Failed to list contents. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `The folder "${normalizedFolderPath || 'root'}" does not exist in your OneDrive.`;
          } else if (err.error?.error?.includes('multi-factor authentication')) {
            errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';
          }
          this.errorMessage = errorMessage;
          console.error(`Error loading folder contents: ${errorMessage}`, err);
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Raw API response:', response);
          let items: OneDriveItem[] = [];
          if (normalizedFolderPath) {
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
            const filePath = this.normalizePath(normalizedFolderPath ? `${normalizedFolderPath}/${item.name}` : item.name);
            const thumbnailUrl = (this.isImage(item) || this.isVideo(item))
              ? this.isVideo(item)
                ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}` // Update to https://api.datakavach.com/isparxcloud for production
                : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}` // Update to https://api.datakavach.com/isparxcloud for production
              : undefined;
            console.log(`Constructed thumbnail URL for ${item.name}: ${thumbnailUrl}`);
            return {
              name: item.name || 'Unknown',
              id: item.id || 'N/A',
              size: item.size || 0,
              type: item.type || 'folder',
              downloadUrl: item.downloadUrl,
              thumbnailUrl,
              mimeType: item.mimeType,
              isHovered: false,
              previewUrl: undefined,
              previewDuration: this.isVideo(item) ? 5 : undefined,
              previewItems: [],
              previewError: undefined
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
            this.errorMessage = `No items found in ${normalizedFolderPath || 'root'}.`;
          }

          this.nextLink = '';
          if (response.nextLink) {
            const baseUrl = normalizedFolderPath
              ? `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(normalizedFolderPath)}` // Update to https://api.datakavach.com/isparxcloud for production
              : `https://datakavach.com/isparxcloud/folders?username=${encodeURIComponent(this.username)}`; // Update to https://api.datakavach.com/isparxcloud for production
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
          console.log('Raw API response for more contents:', response);
          let items: OneDriveItem[] = response.contents || response.folders || [];

          if (!Array.isArray(items)) {
            this.errorMessage = `Invalid response format from server. Expected an array of items.`;
            console.error('Invalid response:', response);
            this.loading = false;
            this.cdr.detectChanges();
            return;
          }

          const newItems = items.map(item => {
            const filePath = this.normalizePath(this.currentPath ? `${this.currentPath}/${item.name}` : item.name);
            return {
              name: item.name || 'Unknown',
              id: item.id || 'N/A',
              size: item.size || 0,
              type: item.type || 'folder',
              downloadUrl: item.downloadUrl,
              thumbnailUrl: (this.isImage(item) || this.isVideo(item))
                ? this.isVideo(item)
                  ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}` // Update to https://api.datakavach.com/isparxcloud for production
                  : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}` // Update to https://api.datakavach.com/isparxcloud for production
                : undefined,
              mimeType: item.mimeType,
              isHovered: false,
              previewUrl: undefined,
              previewDuration: this.isVideo(item) ? 5 : undefined,
              previewItems: [],
              previewError: undefined
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
              ? `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(this.currentPath)}` // Update to https://api.datakavach.com/isparxcloud for production
              : `https://datakavach.com/isparxcloud/folders?username=${encodeURIComponent(this.username)}`; // Update to https://api.datakavach.com/isparxcloud for production
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
    console.error(`Failed to load preview for ${item.name} (${item.type}) at URL: ${item.previewUrl}`, event);
    item.previewError = 'Failed to load image preview.';
    this.showPreviewToast(item.previewError); // Safe: item.previewError is set to a string
    const imgElement = event.target as HTMLImageElement;
    imgElement.style.display = 'none';
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