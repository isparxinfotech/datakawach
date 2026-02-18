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
  name: string;                 // raw name as returned by backend (may be encoded)
  displayName?: string;         // decoded name for UI
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

  // ✅ keep stable refs for add/removeEventListener
  private boundDisableDevTools = (e: KeyboardEvent) => this.disableDevTools(e);
  private onRenameHidden = () => this.closeRenameModal();
  private onShareHidden = () => this.closeShareModal();
  private onDeleteHidden = () => this.closeDeleteModal();

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
    document.addEventListener('keydown', this.boundDisableDevTools);
  }

  // =========================
  // ✅ PATH + ENCODING FIXES
  // =========================

  private normalizePath(path: string): string {
    return path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  }

  /** Decode repeatedly (handles "%2520" -> "%20" -> " ") */
  private decodeRepeated(value: string, maxTimes: number = 3): string {
    let out = value ?? '';
    for (let i = 0; i < maxTimes; i++) {
      try {
        const decoded = decodeURIComponent(out);
        if (decoded === out) break;
        out = decoded;
      } catch {
        break; // if invalid encoding, stop decoding
      }
    }
    return out;
  }

// ✅ MUST be public because template uses it
public cleanSegment(segment: string): string {
  if (!segment) return '';
  try {
    // handle things like Microsoft%2520Copilot -> Microsoft%20Copilot -> Microsoft Copilot
    let s = segment;
    for (let i = 0; i < 2; i++) s = decodeURIComponent(s);
    return s;
  } catch {
    return segment;
  }
}
  /** Build a clean path from currentPath + segment (no double-encoding) */
  private buildPath(...segments: string[]): string {
    const cleaned = segments
      .filter(Boolean)
      .map(s => this.cleanSegment(s));
    return this.normalizePath(cleaned.join('/'));
  }

  /** Show readable name in UI */
  getItemDisplayName(item: OneDriveItem): string {
    return item.displayName || this.decodeRepeated(item.name);
  }

  // =========================

  private fetchUserCreatedDateTime(): void {
    if (!this.username) {
      this.errorMessage = 'Username is missing. Cannot fetch created date time.';
      this.cdr.detectChanges();
      return;
    }

    const url = `https://datakavach.com/isparxcloud/user-created-date?username=${encodeURIComponent(this.username)}`;

    const sub = this.http.get<{ createdDateTime?: string }>(url, { headers: this.getJsonHeaders() })
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
    expiration.setFullYear(createdDate.getFullYear() + 1);

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
      if (renameModalElement) renameModalElement.addEventListener('hidden.bs.modal', this.onRenameHidden);

      const shareModalElement = document.getElementById('shareModal');
      if (shareModalElement) shareModalElement.addEventListener('hidden.bs.modal', this.onShareHidden);

      const deleteModalElement = document.getElementById('deleteModal');
      if (deleteModalElement) deleteModalElement.addEventListener('hidden.bs.modal', this.onDeleteHidden);

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
        catchError(() => {
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

    const newPath = this.buildPath(this.currentPath, folderName);
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

  // ✅ FIXED: download path building (no double encoding)
  downloadFolder(folderName: string): void {
    if (!this.username || !folderName) {
      this.errorMessage = 'Invalid folder or user email.';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const folderPath = this.buildPath(this.currentPath, folderName);

    const url =
      `https://datakavach.com/isparxcloud/download-folder?username=${encodeURIComponent(this.username)}` +
      `&folderPath=${encodeURIComponent(folderPath)}`;

    const sub = this.http
      .get(url, {
        headers: this.getDownloadHeaders(),
        responseType: 'blob',
        observe: 'response'
      })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loading = false;

          let errorMessage = 'Failed to download folder. Please try again.';
          if (err.status === 401) errorMessage = 'Authentication failed. Please log in again.';
          else if (err.status === 404) errorMessage = `Folder "${folderPath}" not found.`;
          else if (err.status === 406) errorMessage = 'Download failed (406). Backend returned ZIP but request Accept was not compatible.';
          else if (err.status === 500) errorMessage = 'Server error. Please contact support.';

          this.errorMessage = errorMessage;
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (res) => {
          const blob = res.body as Blob;

          const cd = res.headers.get('content-disposition') || '';
          const match = /filename="(.+?)"/i.exec(cd);
          const fileName = match?.[1] || `${this.cleanSegment(folderName)}.zip`;

          saveAs(blob, fileName);

          this.successMessage = `Folder "${this.cleanSegment(folderName)}" downloaded successfully as ZIP.`;
          this.loading = false;
          this.cdr.detectChanges();
        }
      });

    this.subscriptions.push(sub);
  }

  openRenameModal(folderName: string): void {
    this.selectedFolder = folderName;
    this.newFolderName = this.cleanSegment(folderName);
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
        if (modal) modal.hide();
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

    const folderPath = this.buildPath(this.currentPath, this.selectedFolder);
    const url = 'https://datakavach.com/isparxcloud/rename-folder';

    const requestBody = {
      username: this.username,
      folderPath,
      newFolderName: this.newFolderName.trim()
    };

    this.loading = true;
    this.renameError = '';
    this.successMessage = '';

    const sub = this.http.patch<{ message?: string }>(url, requestBody, { headers: this.getJsonHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.message || 'Failed to rename folder. Please try again.';
          if (err.status === 401) errorMessage = 'Authentication failed. Please log in again.';
          else if (err.status === 404) errorMessage = `Folder "${folderPath}" not found.`;
          else if (err.status === 400) errorMessage = err.error.message || 'Invalid request. Please check the folder name and try again.';
          else if (err.error?.includes('multi-factor authentication')) errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';

          this.renameError = errorMessage;
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.successMessage = response.message || `Folder renamed successfully.`;
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
        if (modal) modal.hide();
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
        if (modal) modal.hide();
      }
    }
    this.cdr.detectChanges();
  }

  // ✅ FIXED: delete path building (no double encoding)
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

    const itemPath = this.buildPath(this.currentPath, this.selectedItem.name);

    const url =
      `https://datakavach.com/isparxcloud/delete-item?username=${encodeURIComponent(this.username)}` +
      `&itemPath=${encodeURIComponent(itemPath)}` +
      `&isFolder=${this.selectedItem.type === 'folder'}`;

    const sub = this.http.delete<{ message?: string }>(url, { headers: this.getJsonHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || `Failed to delete ${this.selectedItem?.type}. Please try again.`;
          if (err.status === 401) errorMessage = 'Authentication failed. Please log in again.';
          else if (err.status === 404) errorMessage = `${this.selectedItem?.type === 'folder' ? 'Folder' : 'File'} "${itemPath}" not found.`;
          else if (err.status === 400) errorMessage = err.error.error || 'Invalid request. Please check the item and try again.';
          else if (err.status === 500) errorMessage = 'Server error. Please contact support.';

          this.deleteError = errorMessage;
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          const message = response.message || `${this.selectedItem?.type === 'folder' ? 'Folder' : 'File'} deleted successfully.`;
          this.successMessage = message;
          this.deleteSuccessMessage = message;
          this.showDeleteSuccessToast(message);
          this.closeDeleteModal();
          this.loadFolderContents(this.currentPath);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });

    this.subscriptions.push(sub);
  }

  // ✅ FIXED: share path building (no double encoding)
  generateShareLink(item: OneDriveItem): void {
    if (!this.username || !item.name) {
      this.shareError = 'Invalid item or user email.';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.shareError = '';
    this.successMessage = '';

    const itemPath = this.buildPath(this.currentPath, item.name);
    const endpoint = item.type === 'folder' ? 'share-folder' : 'share-file';
    const url = `https://datakavach.com/isparxcloud/${endpoint}`;

    const requestBody = {
      username: this.username,
      folderPath: itemPath
    };

    const sub = this.http.post<{ shareLink: string }>(url, requestBody, { headers: this.getJsonHeaders() })
      .pipe(
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || 'Failed to generate share link. Please try again.';
          if (err.status === 401) errorMessage = 'Authentication failed. Please log in again.';
          else if (err.status === 404) errorMessage = `${item.type === 'folder' ? 'Folder' : 'File'} "${itemPath}" not found.`;
          else if (err.status === 400) errorMessage = err.error.error || 'Invalid request. Please check the item and try again.';
          else if (err.status === 500) errorMessage = 'Server error. Please contact support.';

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
          this.shareLink = response.shareLink;
          this.successMessage = `Share link for "${this.getItemDisplayName(item)}" generated successfully.`;
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

  // ✅ FIXED: preview path building (no double encoding)
  fetchFolderPreview(folderName: string, item: OneDriveItem): void {
    if (!this.username) {
      this.errorMessage = 'Please provide a username.';
      this.cdr.detectChanges();
      return;
    }

    const folderPath = this.buildPath(this.currentPath, folderName);
    const url =
      `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.username)}` +
      `&folderPath=${encodeURIComponent(folderPath)}`;

    const sub = this.http.get<{ contents?: OneDriveItem[] }>(url, { headers: this.getJsonHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          item.previewItems = [];
          item.previewError = err.status === 404 ? `Folder "${this.cleanSegment(folderName)}" not found.` : 'Failed to fetch folder preview.';
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
              const filePath = this.buildPath(folderPath, i.name);
              const previewUrl = this.isVideo(i)
                ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`
                : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`;

              return {
                ...i,
                displayName: this.decodeRepeated(i.name),
                previewUrl,
                previewDuration: this.isVideo(i) ? 5 : undefined,
                isHovered: false,
                previewError: undefined
              };
            });

          if (item.previewItems.length > 0) {
            item.previewUrl = item.previewItems[0].previewUrl;
            item.previewDuration = item.previewItems[0].previewDuration;
            item.previewError = undefined;
          } else {
            item.previewError = 'No previewable items in folder.';
            this.showPreviewToast(item.previewError);
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
      const filePath = this.buildPath(this.currentPath, item.name);

      item.previewDuration = this.isVideo(item) ? 5 : undefined;
      item.previewUrl = this.isVideo(item)
        ? `https://datakavach.com/isparxcloud/video-preview?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`
        : `https://datakavach.com/isparxcloud/thumbnail?username=${encodeURIComponent(this.username)}&filePath=${encodeURIComponent(filePath)}`;

      this.cdr.detectChanges();
    } else {
      item.previewError = 'No preview available for this file type.';
      this.showPreviewToast(item.previewError);
      this.cdr.detectChanges();
    }
  }

  onThumbnailLeave(item: OneDriveItem): void {
    if (item.isHovered) {
      item.isHovered = false;

      const hadVideoInFolder = item.type === 'folder' && (item.previewItems?.some(i => this.isVideo(i)) ?? false);

      if (this.isVideo(item) || hadVideoInFolder) {
        const videoSelector = item.type === 'folder'
          ? `#video-preview-${item.id}-0`
          : `#video-preview-${item.id}`;
        const videoElement = document.querySelector(videoSelector) as HTMLVideoElement;
        if (videoElement) {
          videoElement.pause();
          videoElement.currentTime = 0;
          videoElement.src = '';
        }
      }

      if (item.type === 'folder') {
        item.previewItems = [];
        item.previewUrl = undefined;
      }

      item.previewError = undefined;
      this.cdr.detectChanges();
    }
  }

  // ✅ JSON headers for normal APIs
  private getJsonHeaders(): HttpHeaders {
    const token = this.userSessionDetails?.jwtToken || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
  }

  // ✅ Download headers for binary endpoints (ZIP, etc.)
  private getDownloadHeaders(): HttpHeaders {
    const token = this.userSessionDetails?.jwtToken || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/octet-stream'
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

    const sub = this.http.get<{ contents?: OneDriveItem[], folders?: OneDriveItem[], nextLink?: string }>(url, { headers: this.getJsonHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loading = false;
          let errorMessage = err.error?.error || 'Failed to list contents. Please try again.';
          if (err.status === 401) errorMessage = 'Authentication failed. Please log in again.';
          else if (err.status === 404) errorMessage = `The folder "${normalizedFolderPath || 'root'}" does not exist in your OneDrive.`;
          else if (err.error?.error?.includes('multi-factor authentication')) errorMessage = 'Multi-factor authentication is required for OneDrive access. Contact your administrator to resolve.';

          this.errorMessage = errorMessage;
          this.cdr.detectChanges();
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.oneDriveContents = (response.contents || response.folders || []).map(item => ({
            ...item,
            displayName: this.decodeRepeated(item.name),
            type: item.type || (item.mimeType ? 'file' : 'folder'),
            isHovered: false,
            previewUrl: undefined,
            previewItems: item.type === 'folder' ? [] : undefined,
            previewError: undefined
          }));

          this.totalSize = this.oneDriveContents.reduce((sum, item) => sum + (item.size || 0), 0);
          this.remainingStorage = this.totalStorage - this.totalSize;

          this.filteredContents = [...this.oneDriveContents];
          this.sortContents();
          this.filterContents();

          this.updateStorageChart();
          this.initFolderUsageChart();

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
        this.getItemDisplayName(item).toLowerCase().includes(query)
      );
    }
    this.sortContents();
    this.cdr.detectChanges();
  }

  sortContents(): void {
    this.filteredContents.sort((a, b) => {
      if (this.sortBy === 'name') return this.getItemDisplayName(a).localeCompare(this.getItemDisplayName(b));
      if (this.sortBy === 'type') return a.type.localeCompare(b.type);
      if (this.sortBy === 'size') return (b.size || 0) - (a.size || 0);
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
    if (!canvas) return;

    if (this.storageChart) this.storageChart.destroy();

    const colors = this.isBlackAndWhiteTheme ? ['#333333', '#cccccc'] : ['#007bff', '#e9ecef'];

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
            labels: { color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b' }
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
    if (!canvas) return;

    if (this.folderUsageChart) this.folderUsageChart.destroy();

    const folders = this.filteredContents.filter(item => item.type === 'folder');
    const labels = folders.map(item => this.getItemDisplayName(item));
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
            title: { display: true, text: 'Size (Bytes)', color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b' },
            ticks: { color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b' }
          },
          x: {
            title: { display: true, text: 'Folders', color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b' },
            ticks: { color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b' }
          }
        },
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Folder Usage', color: this.isBlackAndWhiteTheme ? '#333333' : '#1e293b' }
        }
      }
    });

    this.cdr.detectChanges();
  }

  onImgError(event: Event, item: OneDriveItem): void {
    item.previewError = `Failed to load preview for "${this.getItemDisplayName(item)}".`;
    this.showPreviewToast(item.previewError);
    this.cdr.detectChanges();
  }

  disableRightClick(event: MouseEvent): void {
    event.preventDefault();
  }

  disableDevTools(event: KeyboardEvent): void {
    if (event.key === 'F12') {
      event.preventDefault();
      return;
    }
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
    if (this.storageChart) this.storageChart.destroy();
    if (this.folderUsageChart) this.folderUsageChart.destroy();

    this.subscriptions.forEach(sub => sub.unsubscribe());

    const renameModalElement = document.getElementById('renameModal');
    if (renameModalElement) renameModalElement.removeEventListener('hidden.bs.modal', this.onRenameHidden);

    const shareModalElement = document.getElementById('shareModal');
    if (shareModalElement) shareModalElement.removeEventListener('hidden.bs.modal', this.onShareHidden);

    const deleteModalElement = document.getElementById('deleteModal');
    if (deleteModalElement) deleteModalElement.removeEventListener('hidden.bs.modal', this.onDeleteHidden);

    document.removeEventListener('keydown', this.boundDisableDevTools);
  }
}
