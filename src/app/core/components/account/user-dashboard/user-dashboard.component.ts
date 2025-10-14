import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { retry, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

interface OneDriveFolder {
  name: string;
  id: string;
  size: number;
}

interface OneDriveContent {
  name: string;
  type: 'file' | 'folder';
  id: string;
  size?: number;
  downloadUrl?: string;
}

interface S3Bucket {
  name: string;
  region: string;
  size: number;
  objectCount: number;
  creationDate: string;
}

interface S3Content {
  name: string;
  type: 'file' | 'folder';
  size?: number;
  downloadUrl?: string;
  prefix?: string;
}

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  creatorEmail: string = '';
  folderName: string = '';
  currentPath: string = '';
  pathHistory: string[] = [];
  cloudProvider: string = '';
  oneDriveContents: OneDriveContent[] = [];
  oneDriveFolders: OneDriveFolder[] = [];
  loadingOneDrive: boolean = false;
  oneDriveErrorMessage: string = '';
  buckets: S3Bucket[] = [];
  s3Contents: S3Content[] = [];
  selectedBucket: string = '';
  loadingS3: boolean = false;
  s3ErrorMessage: string = '';
  bucketSubscription?: Subscription;
  contentsSubscription?: Subscription;
  folderSubscription?: Subscription;
  retentionNeeded: number | null = null;
  showOtpModal: boolean = false;
  otpInput: string = '';
  otpErrorMessage: string = '';
  folderToDownload: string = '';
  foldersLoaded: boolean = false;

  constructor(private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    // Clear stale session data
    localStorage.removeItem('userDetails');
    localStorage.removeItem('jwtToken');

    this.userSessionDetails = this.authService.getLoggedInUserDetails();

    if (!this.userSessionDetails) {
      this.oneDriveErrorMessage = 'User session not found. Please log in again.';
      this.fetchUserDetails();
      return;
    }

    const { username, cloudProvider, retentionNeeded, userType } = this.userSessionDetails;

    if (!username || !cloudProvider) {
      this.oneDriveErrorMessage = 'Session details incomplete. Fetching user details.';
      this.fetchUserDetails();
      return;
    }

    this.email = username;
    this.cloudProvider = cloudProvider.toLowerCase();
    this.retentionNeeded = retentionNeeded !== undefined ? retentionNeeded : null;

    // Fetch user details to get creatorEmail and confirm retentionNeeded
    this.fetchUserDetails();

    // Add event listener for keydown to block dev tools shortcuts
    document.addEventListener('keydown', this.disableDevTools.bind(this));
  }

  private fetchUserDetails(): void {
    if (!this.email) {
      this.oneDriveErrorMessage = 'User email not found. Please log in again.';
      return;
    }

    const url = `https://datakavach.com/api/auth/users/current?email=${encodeURIComponent(this.email)}`;

    this.http
      .get<userSessionDetails & { createdBy?: string }>(url, { headers: this.getAuthHeaders() })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          let errorMessage = 'Failed to fetch user details. Please try again later.';
          if (err.status === 401) {
            errorMessage = 'Unauthorized: Invalid or missing token. Please log in again.';
            localStorage.removeItem('userDetails');
            localStorage.removeItem('jwtToken');
          } else if (err.status === 403) {
            errorMessage = 'Forbidden: You do not have access to this resource.';
          } else if (err.status === 404) {
            errorMessage = 'User not found. Please register or contact support.';
          }
          this.oneDriveErrorMessage = err.error?.error || errorMessage;
          return throwError(() => new Error(this.oneDriveErrorMessage));
        })
      )
      .subscribe({
        next: (userDetails) => {
          this.userSessionDetails = userDetails;
          this.retentionNeeded = userDetails.retentionNeeded !== undefined ? userDetails.retentionNeeded : null;
          this.cloudProvider = userDetails.cloudProvider?.toLowerCase() || '';
          this.email = userDetails.username || this.email;
          this.creatorEmail = userDetails.createdBy || '';

          // Update local storage
          localStorage.setItem('userDetails', JSON.stringify(userDetails));
          if (userDetails.jwtToken) {
            localStorage.setItem('jwtToken', userDetails.jwtToken);
          }

          // Load data only if not already loaded
          if (!this.foldersLoaded) {
            if (this.cloudProvider === 'aws') {
              this.loadS3Buckets();
            } else if (this.cloudProvider === 'onedrive') {
              this.listRootFolders();
            } else {
              this.oneDriveErrorMessage = `Unsupported cloud provider: ${this.cloudProvider}`;
            }
          }
        }
      });
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.userSessionDetails?.jwtToken || localStorage.getItem('jwtToken') || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }

  listRootFolders(): void {
    this.currentPath = '';
    this.pathHistory = [];
    this.folderName = '';
    this.loadOneDriveFolders();
  }

  listFolderContents(folderName: string): void {
    if (!folderName) {
      this.oneDriveErrorMessage = 'Invalid folder name.';
      return;
    }
    const newPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    this.pathHistory.push(this.currentPath);
    this.currentPath = newPath;
    this.loadFolderContents(newPath);
  }

  navigateBack(): void {
    const previousPath = this.pathHistory.pop();
    this.currentPath = previousPath || '';
    this.loadFolderContents(this.currentPath);
  }

  navigateToPathSegment(index: number): void {
    const pathSegments = this.currentPath.split('/');
    if (index >= pathSegments.length) {
      this.oneDriveErrorMessage = 'Invalid navigation path.';
      return;
    }
    const newPath = pathSegments.slice(0, index + 1).join('/');
    this.pathHistory = this.pathHistory.slice(0, index);
    this.currentPath = newPath;
    this.loadFolderContents(newPath);
  }

  loadOneDriveFolders(): void {
    if (!this.email) {
      this.oneDriveErrorMessage = 'User email is missing. Please log in again.';
      return;
    }

    if (this.foldersLoaded) {
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveFolders = [];

    // Determine endpoint based on userType and retentionNeeded
    const userType = this.userSessionDetails?.userType;
    let endpoint = 'folders';
    if (userType !== undefined && String(userType) === '8') {
      endpoint = 'customer-folder';
    } else if (this.retentionNeeded === 1) {
      endpoint = 'user-folders';
    }

    const url = `https://datakavach.com/isparxcloud/${endpoint}?username=${encodeURIComponent(this.email)}`;

    this.folderSubscription = this.http
      .get<any>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loadingOneDrive = false;
          let errorMessage = `Failed to fetch OneDrive folders via ${endpoint}. Please try again later or contact support.`;
          if (err.status === 500) {
            errorMessage = `Server error fetching OneDrive folders via ${endpoint}. Please contact support.`;
          } else if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
            localStorage.removeItem('userDetails');
            localStorage.removeItem('jwtToken');
          } else if (err.status === 404) {
            errorMessage = 'User account not found or no OneDrive data available.';
          } else if (err.status === 0) {
            errorMessage = 'Network or CORS error. Please check your connection.';
          }
          this.oneDriveErrorMessage = err.error?.error || errorMessage;
          return throwError(() => new Error(this.oneDriveErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          try {
            if (endpoint === 'customer-folder') {
              // Handle customer-folder response: { folder: string }
              if (!response || typeof response !== 'object' || !response.folder) {
                throw new Error('Invalid response format: Expected { folder: string }');
              }
              this.oneDriveFolders = [{
                name: response.folder || 'Unknown Folder',
                id: '',
                size: 0
              }];
            } else if (endpoint === 'user-folders') {
              // Handle user-folders response: { folders: string[] }
              if (!response || typeof response !== 'object' || !Array.isArray(response.folders)) {
                throw new Error('Invalid response format: Expected { folders: string[] }');
              }
              this.oneDriveFolders = response.folders.map((folderName: string) => ({
                name: folderName || 'Unknown Folder',
                id: '',
                size: 0
              }));
            } else {
              // Handle folders response: { folders: [{name, id, size}], nextLink?: string }
              if (!response || typeof response !== 'object' || !Array.isArray(response.folders)) {
                throw new Error('Invalid response format: Expected { folders: array, nextLink?: string }');
              }
              this.oneDriveFolders = response.folders.map((folder: any) => ({
                name: folder.name || 'Unknown Folder',
                id: folder.id || '',
                size: folder.size || 0
              }));
            }

            if (this.oneDriveFolders.length === 0) {
              this.oneDriveErrorMessage = 'No folders found in your OneDrive account.';
            } else {
              this.foldersLoaded = true;
            }
          } catch (parseError: any) {
            this.oneDriveErrorMessage = `Invalid server response from OneDrive ${endpoint}.`;
            this.oneDriveFolders = [];
          }
          this.loadingOneDrive = false;
        }
      });
  }

  listOneDriveContents(): void {
    if (!this.email || !this.folderName) {
      this.oneDriveErrorMessage = 'Please select a folder from the dropdown.';
      return;
    }

    const isValidFolder = this.oneDriveFolders.some((folder) => folder.name === this.folderName);
    if (!isValidFolder) {
      this.oneDriveErrorMessage = `Invalid folder selected: "${this.folderName}".`;
      return;
    }

    this.currentPath = this.folderName;
    this.pathHistory = [];
    this.loadFolderContents(this.currentPath);
  }

  private loadFolderContents(folderPath: string): void {
    if (!this.email) {
      this.oneDriveErrorMessage = 'User email is missing. Please log in again.';
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveContents = [];

    const encodedFolderPath = encodeURIComponent(folderPath);
    const url = folderPath
      ? `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.email)}&folderPath=${encodedFolderPath}`
      : `https://datakavach.com/isparxcloud/folder-contents?username=${encodeURIComponent(this.email)}&folderPath=root`;

    this.contentsSubscription = this.http
      .get<{ contents: OneDriveContent[]; nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loadingOneDrive = false;
          let errorMessage = 'Failed to fetch OneDrive contents. Please try again.';
          if (err.status === 500) {
            errorMessage = 'Server error fetching OneDrive contents.';
          } else if (err.status === 404) {
            errorMessage = `Folder "${folderPath || 'root'}" not found.`;
          } else if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
            localStorage.removeItem('userDetails');
            localStorage.removeItem('jwtToken');
          } else if (err.status === 0) {
            errorMessage = 'Network or CORS error. Please check your connection.';
          }
          this.oneDriveErrorMessage = err.error?.error || errorMessage;
          return throwError(() => new Error(this.oneDriveErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          try {
            if (!response || typeof response !== 'object' || !Array.isArray(response.contents)) {
              throw new Error('Invalid response format: Expected { contents: [{ name, type, id, size, downloadUrl? }], nextLink: string }');
            }
            this.oneDriveContents = response.contents.map((item: any) => {
              const content: OneDriveContent = {
                name: item.name || 'Unknown',
                type: item.type || 'file',
                id: item.id || '',
                size: item.size !== undefined ? item.size : undefined,
                downloadUrl: item.downloadUrl || ''
              };
              return content;
            });
            if (this.oneDriveContents.length === 0) {
              this.oneDriveErrorMessage = `No contents found in "${folderPath || 'root'}" for "${this.email}".`;
            }
          } catch (parseError: any) {
            this.oneDriveErrorMessage = 'Invalid server response from OneDrive.';
            this.oneDriveContents = [];
          }
          this.loadingOneDrive = false;
        }
      });
  }

  generateOtp(): void {
    if (!this.email) {
      this.oneDriveErrorMessage = 'User email is missing. Please log in again.';
      return;
    }

    this.otpErrorMessage = '';
    const url = `https://datakavach.com/isparxcloud/generate-otp?username=${encodeURIComponent(this.email)}`;

    this.http
      .post<{ message: string }>(url, {}, { headers: this.getAuthHeaders() })
      .pipe(
        catchError((err) => {
          let errorMessage = 'Failed to generate OTP. Please try again.';
          if (err.status === 404) {
            errorMessage = 'Creator email not found. Please contact support.';
          } else if (err.status === 500) {
            errorMessage = 'Server error generating OTP. Please try again later.';
          }
          this.otpErrorMessage = err.error?.error || errorMessage;
          return throwError(() => new Error(this.otpErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.otpErrorMessage = this.creatorEmail
            ? `OTP sent to creator's email (${this.creatorEmail}). Please check and enter the OTP.`
            : 'OTP sent to creator\'s email. Please check and enter the OTP.';
        }
      });
  }

  verifyOtpAndDownload(): void {
    if (!this.email || !this.otpInput || !this.folderToDownload) {
      this.otpErrorMessage = 'Missing OTP or folder details.';
      return;
    }

    const url = `https://datakavach.com/isparxcloud/verify-otp?username=${encodeURIComponent(this.email)}&otp=${encodeURIComponent(this.otpInput)}`;

    this.http
      .post<{ isValid: boolean }>(url, {}, { headers: this.getAuthHeaders() })
      .pipe(
        catchError((err) => {
          this.otpErrorMessage = err.error?.error || 'Failed to verify OTP. Please try again.';
          return throwError(() => new Error(this.otpErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          if (response.isValid) {
            this.showOtpModal = false;
            this.otpInput = '';
            this.otpErrorMessage = '';
            this.initiateFolderDownload(this.folderToDownload);
          } else {
            this.otpErrorMessage = 'Invalid or expired OTP. Please try again.';
          }
        }
      });
  }

  downloadFolder(folderName: string): void {
    if (!folderName || !this.email) {
      this.oneDriveErrorMessage = 'Invalid folder or user details.';
      return;
    }

    if (this.retentionNeeded === 1) {
      this.folderToDownload = folderName;
      this.showOtpModal = true;
      this.otpInput = '';
      this.otpErrorMessage = '';
      this.generateOtp();
    } else {
      this.initiateFolderDownload(folderName);
    }
  }

  private initiateFolderDownload(folderName: string): void {
    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';

    const folderPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    const url = `https://datakavach.com/isparxcloud/download-folder?username=${encodeURIComponent(this.email)}&folderPath=${encodeURIComponent(folderPath)}`;

    this.http
      .get(url, {
        headers: this.getAuthHeaders(),
        responseType: 'blob'
      })
      .pipe(
        catchError((err) => {
          this.loadingOneDrive = false;
          this.oneDriveErrorMessage = err.error?.error || 'Failed to download folder. Please try again.';
          return throwError(() => new Error(this.oneDriveErrorMessage));
        })
      )
      .subscribe({
        next: (blob) => {
          const link = document.createElement('a');
          link.href = window.URL.createObjectURL(blob);
          link.download = `${folderName}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(link.href);
          this.loadingOneDrive = false;
        }
      });
  }

  loadS3Buckets(): void {
    if (!this.email) {
      this.s3ErrorMessage = 'User email is missing. Please log in again.';
      return;
    }

    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.buckets = [];

    const url = `https://datakavach.com/s3/buckets?username=${encodeURIComponent(this.email)}`;

    this.bucketSubscription = this.http
      .get<{ buckets: S3Bucket[] }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loadingS3 = false;
          let errorMessage = 'Failed to fetch S3 buckets. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
            localStorage.removeItem('userDetails');
            localStorage.removeItem('jwtToken');
          } else if (err.status === 404) {
            errorMessage = 'No S3 buckets found for your account.';
          }
          this.s3ErrorMessage = err.error?.error || errorMessage;
          return throwError(() => new Error(this.s3ErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.buckets = response.buckets || [];
          if (this.buckets.length === 0) {
            this.s3ErrorMessage = 'No S3 buckets found for your account.';
          }
          this.loadingS3 = false;
        }
      });
  }

  listS3BucketContents(bucketName: string): void {
    if (!this.email || !bucketName) {
      this.s3ErrorMessage = 'Please select a bucket.';
      return;
    }

    this.selectedBucket = bucketName;
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.s3Contents = [];

    const url = `https://datakavach.com/s3/contents?username=${encodeURIComponent(this.email)}&bucketName=${encodeURIComponent(bucketName)}`;

    this.contentsSubscription = this.http
      .get<{ contents: S3Content[] }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loadingS3 = false;
          let errorMessage = 'Failed to fetch S3 contents. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
            localStorage.removeItem('userDetails');
            localStorage.removeItem('jwtToken');
          } else if (err.status === 404) {
            errorMessage = `No contents found in bucket "${bucketName}".`;
          }
          this.s3ErrorMessage = err.error?.error || errorMessage;
          return throwError(() => new Error(this.s3ErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.s3Contents = response.contents || [];
          if (this.s3Contents.length === 0) {
            this.s3ErrorMessage = `No contents found in bucket "${bucketName}".`;
          }
          this.loadingS3 = false;
        }
      });
  }

  listS3FolderContents(bucketName: string, prefix: string): void {
    if (!this.email || !bucketName || !prefix) {
      this.s3ErrorMessage = 'Invalid bucket or folder path.';
      return;
    }

    this.selectedBucket = bucketName;
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.s3Contents = [];

    const url = `https://datakavach.com/s3/contents?username=${encodeURIComponent(this.email)}&bucketName=${encodeURIComponent(bucketName)}&prefix=${encodeURIComponent(prefix)}`;

    this.contentsSubscription = this.http
      .get<{ contents: S3Content[] }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          this.loadingS3 = false;
          let errorMessage = 'Failed to fetch S3 folder contents. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
            localStorage.removeItem('userDetails');
            localStorage.removeItem('jwtToken');
          } else if (err.status === 404) {
            errorMessage = `No contents found in folder "${prefix}" of bucket "${bucketName}".`;
          }
          this.s3ErrorMessage = err.error?.error || errorMessage;
          return throwError(() => new Error(this.s3ErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          this.s3Contents = response.contents || [];
          if (this.s3Contents.length === 0) {
            this.s3ErrorMessage = `No contents found in folder "${prefix}" of bucket "${bucketName}".`;
          }
          this.loadingS3 = false;
        }
      });
  }

  toggleSidebar(): void {
    const sidebar = document.querySelector('#bdSidebar');
    if (sidebar) {
      sidebar.classList.toggle('show');
    }
  }

  viewFile(downloadUrl: string): void {
    if (!downloadUrl) {
      this.oneDriveErrorMessage = 'Invalid file URL. Please try again.';
      return;
    }
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  downloadFile(downloadUrl: string, fileName: string): void {
    if (!downloadUrl || !fileName) {
      this.oneDriveErrorMessage = 'Invalid file details.';
      return;
    }

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    this.bucketSubscription?.unsubscribe();
    this.contentsSubscription?.unsubscribe();
    this.folderSubscription?.unsubscribe();
    document.removeEventListener('keydown', this.disableDevTools.bind(this));
  }
}