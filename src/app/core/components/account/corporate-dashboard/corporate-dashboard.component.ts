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
  deleteSuccessMessage: string = '';
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

  showDeleteModal: boolean = false;
  deleteError: string = '';

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

    // Add event listener for keydown to block dev tools shortcuts
    document.addEventListener('keydown', this.disableDevTools.bind(this));
  }

  private fetchUserCreatedDateTime(): void {
    if (!this.username) {
      this.errorMessage = 'Username is missing. Cannot fetch created date time.';
      this.cdr.detectChanges();
      return;
    }

    const url = `https://datakavach.com/isparxcloud/user-created-date?username=${encodeURIComponent(this.username)}`;

    const sub = this.http.get<{ createdDateTime?: string }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.errorMessage = err.error?.error || 'Failed to fetch user created date time.';
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
      const deleteModalElement = document.getElementById('deleteModal');
      if (deleteModalElement) {
        deleteModalElement.addEventListener('hidden.bs.modal', () => {
          this.closeDeleteModal();
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

  private showDeleteSuccessToast(message: string): void {
    this.deleteSuccessMessage = message;
    const toastElement = document.getElementById('deleteSuccessToast');
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
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const folderPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${folderName}` : folderName);
    const url = `https://datakavach.com/isparxcloud/download-folder?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`;

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
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          const blob = new Blob([response], { type: 'application/zip' });
          saveAs(blob, `${folderName}.zip`);
          this.successMessage = `Folder "${folderName}" downloaded successfully as ZIP.`;
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
    const url = 'https://datakavach.com/isparxcloud/rename-folder';

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

  openDeleteModal(item: OneDriveItem): void {
    this.selectedItem = item;
    this.deleteError = '';
    this.successMessage = '';
    this.deleteSuccessMessage = '';
    this.showDeleteModal = true;
    const modalElement = document.getElementById('deleteModal');
    if (modalElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Modal) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
      }
    }
    this.cdr.detectChanges();
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
    this.selectedItem = null;
    this.deleteError = '';
    const modalElement = document.getElementById('deleteModal');
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

  deleteItem(): void {
    if (!this.username || !this.selectedItem?.name) {
      this.deleteError = 'Invalid item or user email.';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.deleteError = '';
    this.successMessage = '';
    this.deleteSuccessMessage = '';

    const itemPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${this.selectedItem.name}` : this.selectedItem.name);
    const url = `https://datakavach.com/isparxcloud/delete-item?username=${encodeURIComponent(this.username)}&itemPath=${encodeURIComponent(itemPath)}&isFolder=${this.selectedItem.type === 'folder'}`;

    const sub = this.http.delete<{ message?: string }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || `Failed to delete ${this.selectedItem?.type}. Please try again.`;
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `${this.selectedItem?.type === 'folder' ? 'Folder' : 'File'} "${itemPath}" not found.`;
          } else if (err.status === 400) {
            errorMessage = err.error.error || 'Invalid request. Please check the item and try again.';
          } else if (err.status === 500) {
            errorMessage = 'Server error. Please contact support.';
          }
          this.deleteError = errorMessage;
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          const message = response.message || `${this.selectedItem?.type === 'folder' ? 'Folder' : 'File'} "${this.selectedItem?.name}" deleted successfully.`;
          this.successMessage = message; // For alert
          this.deleteSuccessMessage = message; // For toast
          this.showDeleteSuccessToast(message);
          this.closeDeleteModal();
          this.loadFolderContents(this.currentPath);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  generateShareLink(item: OneDriveItem): void {
    if (!this.username || !item.name) {
      this.shareError = 'Invalid item or user email.';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.shareError = '';
    this.successMessage = '';

    const itemPath = this.normalizePath(this.currentPath ? `${this.currentPath}/${item.name}` : item.name);
    const endpoint = item.type === 'folder' ? 'share-folder' : 'share-file';
    const url = `https://datakavach.com/isparxcloud/${endpoint}`;

    const requestBody = {
      username: this.username,
      folderPath: itemPath
    };

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
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          if (!response.shareLink || !response.shareLink.includes('token=')) {
            this.shareError = 'Invalid share link received from server.';
            this.loading = false;
            this.cdr.detectChanges();
            return;
          }
          this.shareLink = response.shareLink; // Use backend-provided URL directly
          this.successMessage = `Share link for "${item.name}" generated successfully.`;
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
    const url = `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(folderPath)}`;

    const sub = this.http.get<{ contents?: OneDriveItem[] }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          item.previewItems = [];
          item.previewError = err.status === 404 ? `Folder "${folderName}" not found.` : 'Failed to fetch folder preview.';
          this.showPreviewToast(item.previewError);
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
                ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`
                : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`;
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
                    this.showPreviewToast(previewItem.previewError);
                    this.cdr.detectChanges();
                    return throwError(() => new Error(previewItem.previewError));
                  })
                )
                .subscribe({
                  next: () => {
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
            this.showPreviewToast(item.previewError || 'No previewable items available.');
          }
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  onThumbnailHover(item: OneDriveItem): void {
    if (item.isHovered) return;
    item.isHovered = true;
    item.previewError = undefined;

    if (item.type === 'folder') {
      this.fetchFolderPreview(item.name, item);
    } else if (this.isImage(item) || this.isVideo(item)) {
      const filePath = this.normalizePath(this.currentPath ? `${this.currentPath}/${item.name}` : item.name);
      item.previewDuration = this.isVideo(item) ? 5 : undefined;
      item.previewUrl = this.isVideo(item)
        ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`
        : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`;

      if (!item.previewUrl) {
        item.previewError = 'No preview URL available.';
        this.showPreviewToast(item.previewError);
        this.cdr.detectChanges();
        return;
      }

      // Trigger change detection to render video/image element
      this.cdr.detectChanges();

      // Perform preflight check for videos
      if (this.isVideo(item)) {
        const checkUrl = item.previewUrl;
        const sub = this.http.head(checkUrl, { headers: this.getAuthHeaders() })
          .pipe(
            retry({ count: 2, delay: 1000 }),
            catchError((err) => {
              const errorMessage = err.status === 404
                ? `Video "${item.name}" not found at path "${filePath}".`
                : `Failed to verify video preview for "${item.name}": ${err.message || 'Unknown error'}`;
              item.previewError = errorMessage;
              this.showPreviewToast(errorMessage);
              this.cdr.detectChanges();
              return throwError(() => new Error(errorMessage));
            })
          )
          .subscribe({
            next: () => {
              // Ensure previewUrl and video element are available
              setTimeout(() => {
                if (!item.previewUrl) {
                  item.previewError = 'Preview URL lost after preflight check.';
                  this.showPreviewToast(item.previewError);
                  this.cdr.detectChanges();
                  return;
                }
                const videoSelector = `#video-preview-${item.id}`;
                const videoElement = document.querySelector(videoSelector) as HTMLVideoElement;
                if (!videoElement) {
                  item.previewError = 'Video element not found for preview.';
                  this.showPreviewToast(item.previewError);
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
      this.showPreviewToast(item.previewError);
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

    if (!previewUrl) {
      item.previewError = 'No video preview URL available.';
      this.showPreviewToast(item.previewError);
      this.cdr.detectChanges();
      return;
    }

    if (!videoElement) {
      item.previewError = 'Video element not found.';
      this.showPreviewToast(item.previewError);
      this.cdr.detectChanges();
      return;
    }

    videoElement.muted = true;
    videoElement.currentTime = 0;
    videoElement.src = previewUrl; // Explicitly set src
    videoElement.load(); // Force reload to ensure src is applied
    videoElement.play().catch(err => {
      item.previewError = err.status === 404 ? `Video "${item.name}" not found.` : `Failed to play video preview: ${err.message || 'Unknown error'}`;
      this.showPreviewToast(item.previewError);
      this.cdr.detectChanges();
      setTimeout(() => {
        videoElement.src = previewUrl; // Reassign src for retry
        videoElement.load();
        videoElement.play().catch(err2 => {
          item.previewError = `Video playback failed after retry: ${err2.message || 'Unknown error'}`;
          this.showPreviewToast(item.previewError);
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
    this.deleteSuccessMessage = '';
    this.oneDriveContents = [];
    this.filteredContents = [];
    this.totalSize = 0;

    const normalizedFolderPath = this.normalizePath(folderPath);
    const url = normalizedFolderPath
      ? `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.username)}&folderPath=${encodeURIComponent(normalizedFolderPath)}`
      : `https://datakavach.com/isparxcloud/folders?username=${encodeURIComponent(this.username)}`;

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
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.oneDriveContents = (response.contents || response.folders || []).map(item => ({
            ...item,
            type: item.type || (item.mimeType ? 'file' : 'folder'),
            isHovered: false,
            previewUrl: undefined,
            previewItems: item.type === 'folder' ? [] : undefined,
            previewError: undefined
          }));

          // Calculate total size
          this.totalSize = this.oneDriveContents.reduce((sum, item) => sum + (item.size || 0), 0);
          this.remainingStorage = this.totalStorage - this.totalSize;

          // Initialize filtered contents
          this.filteredContents = [...this.oneDriveContents];
          this.sortContents();
          this.filterContents();

          // Update charts
          this.updateStorageChart();
          this.initFolderUsageChart();

          // Handle pagination
          this.nextLink = response.nextLink || '';

          this.loading = false;
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    this.subscriptions.push(sub);
  }

  filterContents(): void {
    if (!this.searchQuery.trim()) {
      this.filteredContents = [...this.oneDriveContents];
    } else {
      const query = this.searchQuery.toLowerCase().trim();
      this.filteredContents = this.oneDriveContents.filter(item =>
        item.name.toLowerCase().includes(query)
      );
    }
    this.sortContents();
    this.cdr.detectChanges();
  }

  sortContents(): void {
    this.filteredContents.sort((a, b) => {
      if (this.sortBy === 'name') {
        return a.name.localeCompare(b.name);
      } else if (this.sortBy === 'type') {
        return a.type.localeCompare(b.type);
      } else if (this.sortBy === 'size') {
        return (b.size || 0) - (a.size || 0);
      }
      return 0;
    });
    this.cdr.detectChanges();
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  hasFolders(): boolean {
    return this.filteredContents.some(item => item.type === 'folder');
  }

  updateStorageChart(): void {
    const canvas = document.getElementById('storageChart') as HTMLCanvasElement;
    if (!canvas) {
      return;
    }

    if (this.storageChart) {
      this.storageChart.destroy();
    }

    const colors = this.isBlackAndWhiteTheme
      ? ['#333333', '#cccccc']
      : ['#007bff', '#e9ecef'];

    this.storageChart = new Chart<'doughnut', number[], string>(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Used', 'Free'],
        datasets: [{
          data: [this.totalSize, this.remainingStorage],
          backgroundColor: colors,
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
              color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b'
            }
          },
          title: {
            display: true,
            text: 'Storage Usage',
            color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b'
          }
        }
      }
    });
    this.cdr.detectChanges();
  }

  initFolderUsageChart(): void {
    const canvas = document.getElementById('folderUsageChart') as HTMLCanvasElement;
    if (!canvas) {
      return;
    }

    if (this.folderUsageChart) {
      this.folderUsageChart.destroy();
    }

    const folders = this.filteredContents.filter(item => item.type === 'folder');
    const labels = folders.map(item => item.name);
    const data = folders.map(item => item.size || 0);
    const colors = this.isBlackAndWhiteTheme
      ? ['#333333', '#555555', '#777777', '#999999', '#bbbbbb']
      : ['#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8'];

    this.folderUsageChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Folder Size',
          data,
          backgroundColor: colors.slice(0, labels.length),
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
              text: 'Size (Bytes)',
              color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b'
            },
            ticks: {
              color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Folders',
              color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b'
            },
            ticks: {
              color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b'
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: true,
            text: 'Folder Usage',
            color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b'
          }
        }
      }
    });
    this.cdr.detectChanges();
  }

  onImgError(event: Event, item: OneDriveItem): void {
    item.previewError = `Failed to load preview for "${item.name}".`;
    this.showPreviewToast(item.previewError);
    this.cdr.detectChanges();
  }

  disableRightClick(event: MouseEvent): void {
    event.preventDefault();
  }

  disableDevTools(event: KeyboardEvent): void {
    // Block F12
    if (event.key === 'F12') {
      event.preventDefault();
      return;
    }
    // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    if (event.ctrlKey && event.shiftKey && (event.key === 'I' || event.key === 'i' || event.key === 'J' || event.key === 'j')) {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey && (event.key === 'U' || event.key === 'u')) {
      event.preventDefault();
      return;
    }
  }

  ngOnDestroy(): void {
    // Clean up charts
    if (this.storageChart) {
      this.storageChart.destroy();
    }
    if (this.folderUsageChart) {
      this.folderUsageChart.destroy();
    }

    // Unsubscribe from all HTTP subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());

    // Clean up modal event listeners
    const renameModalElement = document.getElementById('renameModal');
    if (renameModalElement) {
      renameModalElement.removeEventListener('hidden.bs.modal', () => {
        this.closeRenameModal();
      });
    }
    const shareModalElement = document.getElementById('shareModal');
    if (shareModalElement) {
      shareModalElement.removeEventListener('hidden.bs.modal', () => {
        this.closeShareModal();
      });
    }
    const deleteModalElement = document.getElementById('deleteModal');
    if (deleteModalElement) {
      deleteModalElement.removeEventListener('hidden.bs.modal', () => {
        this.closeDeleteModal();
      });
    }

    // Clean up toasts
    const previewToastElement = document.getElementById('previewToast');
    if (previewToastElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Toast) {
        const toast = bootstrap.Toast.getInstance(previewToastElement);
        if (toast) {
          toast.dispose();
        }
      }
    }
    const deleteSuccessToastElement = document.getElementById('deleteSuccessToast');
    if (deleteSuccessToastElement) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap && bootstrap.Toast) {
        const toast = bootstrap.Toast.getInstance(deleteSuccessToastElement);
        if (toast) {
          toast.dispose();
        }
      }
    }

    // Clean up any active video elements
    this.oneDriveContents.forEach(item => {
      if (item.isHovered && (this.isVideo(item) || (item.type === 'folder' && item.previewItems?.some(i => this.isVideo(i))))) {
        const videoSelector = item.type === 'folder' && item.previewItems?.length
          ? `#video-preview-${item.id}-0`
          : `#video-preview-${item.id}`;
        const videoElement = document.querySelector(videoSelector) as HTMLVideoElement;
        if (videoElement) {
          videoElement.pause();
          videoElement.currentTime = 0;
          videoElement.src = '';
        }
      }
    });

    // Remove keydown event listener
    document.removeEventListener('keydown', this.disableDevTools.bind(this));
  }
}