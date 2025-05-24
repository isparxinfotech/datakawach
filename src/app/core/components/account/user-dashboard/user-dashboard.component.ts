import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { retry, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { saveAs } from 'file-saver';

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

  constructor(private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();

    if (!this.userSessionDetails) {
      console.warn('No user session found. Skipping dashboard load.');
      this.oneDriveErrorMessage = 'User session not found. Please log in again.';
      return;
    }

    const { username, cloudProvider } = this.userSessionDetails;

    if (!username || !cloudProvider) {
      console.error('User session details incomplete:', this.userSessionDetails);
      this.oneDriveErrorMessage = 'Session details incomplete. Please log in again.';
      return;
    }

    this.email = username;
    this.cloudProvider = cloudProvider.toLowerCase();

    if (this.cloudProvider === 'aws') {
      this.loadS3Buckets();
    } else if (this.cloudProvider === 'onedrive') {
      this.listRootFolders();
    } else {
      console.warn('Unsupported cloud provider:', this.cloudProvider);
      this.oneDriveErrorMessage = `Unsupported cloud provider: ${this.cloudProvider}`;
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.userSessionDetails?.jwtToken || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
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
      console.error('No email available for folder fetch');
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveFolders = [];

    const url = `https://datakavach.com/onedrive/folders?username=${encodeURIComponent(this.email)}`;
    console.log('Fetching OneDrive root folders:', { url, email: this.email });

    this.folderSubscription = this.http
      .get<{ folders: OneDriveFolder[]; nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({
          count: 2,
          delay: 1000
        }),
        catchError((err) => {
          this.loadingOneDrive = false;
          let errorMessage = 'Failed to fetch OneDrive folders. Please try again later or contact support.';
          if (err.status === 500) {
            errorMessage = 'Server error fetching OneDrive folders. This may be due to OneDrive configuration issues. Please contact support.';
          } else if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = 'User account not found or no OneDrive data available. Please register or contact support.';
          } else if (err.status === 0) {
            errorMessage = 'Network or CORS error. Please check your internet connection or server configuration.';
          }
          this.oneDriveErrorMessage = err.error?.error || errorMessage;
          console.error('OneDrive folder error:', {
            status: err.status,
            statusText: err.statusText,
            url: err.url,
            message: err.message,
            error: err.error,
            email: this.email
          });
          return throwError(() => new Error(this.oneDriveErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Raw response from /folders:', JSON.stringify(response, null, 2));
          try {
            if (!response || typeof response !== 'object' || !Array.isArray(response.folders)) {
              throw new Error('Invalid response format: Expected { folders: [{ name, id, size }], nextLink: string }');
            }
            this.oneDriveFolders = response.folders.map((folder) => ({
              name: folder.name || 'Unknown Folder',
              id: folder.id || '',
              size: folder.size || 0
            }));
            if (this.oneDriveFolders.length === 0) {
              this.oneDriveErrorMessage = 'No folders found in your OneDrive account. Please create a folder or verify your account.';
            }
          } catch (parseError: any) {
            console.error('Error parsing /folders response:', {
              error: parseError.message,
              response: JSON.stringify(response, null, 2)
            });
            this.oneDriveErrorMessage = 'Invalid server response from OneDrive. Please try again or contact support.';
            this.oneDriveFolders = [];
          }
          this.loadingOneDrive = false;
          console.log('OneDrive folders loaded:', this.oneDriveFolders);
        }
      });
  }

  listOneDriveContents(): void {
    if (!this.email || !this.folderName) {
      this.oneDriveErrorMessage = 'Please select a folder from the dropdown.';
      console.error('Missing parameters:', { email: this.email, folderName: this.folderName });
      return;
    }

    const isValidFolder = this.oneDriveFolders.some((folder) => folder.name === this.folderName);
    if (!isValidFolder) {
      this.oneDriveErrorMessage = `Invalid folder selected: "${this.folderName}". Please select a valid folder.`;
      console.error('Invalid folderName:', this.folderName);
      return;
    }

    this.currentPath = this.folderName;
    this.pathHistory = [];
    this.loadFolderContents(this.currentPath);
  }

  private loadFolderContents(folderPath: string): void {
    if (!this.email) {
      this.oneDriveErrorMessage = 'User email is missing. Please log in again.';
      console.error('No email available for folder contents fetch');
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveContents = [];

    const encodedFolderPath = encodeURIComponent(folderPath);
    const url = folderPath
      ? `https://datakavach.com/onedrive/folder-contents?username=${encodeURIComponent(this.email)}&folderPath=${encodedFolderPath}`
      : `https://datakavach.com/onedrive/folder-contents?username=${encodeURIComponent(this.email)}&folderPath=root`;

    console.log('Fetching OneDrive contents:', { url, email: this.email, folderPath });

    this.contentsSubscription = this.http
      .get<{ contents: OneDriveContent[]; nextLink: string }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({
          count: 2,
          delay: 1000
        }),
        catchError((err) => {
          this.loadingOneDrive = false;
          let errorMessage = 'Failed to fetch OneDrive contents. Please try again or contact support.';
          if (err.status === 500) {
            errorMessage = 'Server error fetching OneDrive contents. Please verify the folder or contact support.';
          } else if (err.status === 404) {
            errorMessage = `Folder "${folderPath || 'root'}" not found in OneDrive for "${this.email}".`;
          } else if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 0) {
            errorMessage = 'Network or CORS error. Please check your internet connection or server configuration.';
          }
          this.oneDriveErrorMessage = err.error?.error || errorMessage;
          console.error('OneDrive contents error:', {
            status: err.status,
            statusText: err.statusText,
            url: err.url,
            message: err.message,
            error: err.error,
            email: this.email,
            folderPath
          });
          return throwError(() => new Error(this.oneDriveErrorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          console.log('Raw response from /folder-contents:', JSON.stringify(response, null, 2));
          try {
            if (!response || typeof response !== 'object' || !Array.isArray(response.contents)) {
              throw new Error('Invalid response format: Expected { contents: [{ name, type, id, size, downloadUrl }], nextLink: string }');
            }
            this.oneDriveContents = response.contents.map((item) => {
              if (item.type === 'file' && !item.downloadUrl) {
                console.warn(`Missing downloadUrl for file: ${item.name}`);
              }
              return {
                name: item.name || 'Unknown',
                type: item.type || 'file',
                id: item.id || '',
                size: item.size,
                downloadUrl: item.downloadUrl
              };
            });
            if (this.oneDriveContents.length === 0) {
              this.oneDriveErrorMessage = `No contents found in "${folderPath || 'root'}" for "${this.email}".`;
            }
          } catch (parseError: any) {
            console.error('Error parsing /folder-contents response:', {
              error: parseError.message,
              response: JSON.stringify(response, null, 2)
            });
            this.oneDriveErrorMessage = 'Invalid server response from OneDrive. Please try again or contact support.';
            this.oneDriveContents = [];
          }
          this.loadingOneDrive = false;
          console.log('OneDrive contents loaded:', this.oneDriveContents);
        }
      });
  }

  loadS3Buckets(): void {
    if (!this.email) {
      this.s3ErrorMessage = 'User email is missing. Please log in again.';
      console.error('No email available for S3 bucket fetch');
      return;
    }

    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.buckets = [];

    const url = `https://datakavach.com/s3/buckets?username=${encodeURIComponent(this.email)}`;
    console.log('Fetching S3 buckets:', { url, email: this.email });

    this.bucketSubscription = this.http
      .get<{ buckets: S3Bucket[] }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({
          count: 2,
          delay: 1000
        }),
        catchError((err) => {
          this.loadingS3 = false;
          this.s3ErrorMessage = err.error?.error || 'Failed to fetch S3 buckets. Please try again or contact support.';
          console.error('S3 bucket error:', {
            status: err.status,
            statusText: err.statusText,
            url: err.url,
            message: err.message,
            error: err.error,
            email: this.email
          });
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
          console.log('S3 buckets loaded:', this.buckets);
        }
      });
  }

  listS3BucketContents(bucketName: string): void {
    if (!this.email || !bucketName) {
      this.s3ErrorMessage = 'Please select a bucket.';
      console.error('Missing parameters:', { email: this.email, bucketName });
      return;
    }

    this.selectedBucket = bucketName;
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.s3Contents = [];

    const url = `https://datakavach.com/s3/contents?username=${encodeURIComponent(this.email)}&bucketName=${encodeURIComponent(bucketName)}`;
    console.log('Fetching S3 bucket contents:', { url, email: this.email, bucketName });

    this.contentsSubscription = this.http
      .get<{ contents: S3Content[] }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({
          count: 2,
          delay: 1000
        }),
        catchError((err) => {
          this.loadingS3 = false;
          this.s3ErrorMessage = err.error?.error || 'Failed to fetch S3 contents. Please try again or contact support.';
          console.error('S3 contents error:', {
            status: err.status,
            statusText: err.statusText,
            url: err.url,
            message: err.message,
            error: err.error,
            email: this.email,
            bucketName
          });
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
          console.log('S3 contents loaded:', this.s3Contents);
        }
      });
  }

  listS3FolderContents(bucketName: string, prefix: string): void {
    if (!this.email || !bucketName || !prefix) {
      this.s3ErrorMessage = 'Invalid bucket or folder path.';
      console.error('Missing parameters:', { email: this.email, bucketName, prefix });
      return;
    }

    this.selectedBucket = bucketName;
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.s3Contents = [];

    const url = `https://datakavach.com/s3/contents?username=${encodeURIComponent(this.email)}&bucketName=${encodeURIComponent(bucketName)}&prefix=${encodeURIComponent(prefix)}`;
    console.log('Fetching S3 folder contents:', { url, email: this.email, bucketName, prefix });

    this.contentsSubscription = this.http
      .get<{ contents: S3Content[] }>(url, {
        headers: this.getAuthHeaders()
      })
      .pipe(
        retry({
          count: 2,
          delay: 1000
        }),
        catchError((err) => {
          this.loadingS3 = false;
          this.s3ErrorMessage = err.error?.error || 'Failed to fetch S3 folder contents. Please try again or contact support.';
          console.error('S3 folder contents error:', {
            status: err.status,
            statusText: err.statusText,
            url: err.url,
            message: err.message,
            error: err.error,
            email: this.email,
            bucketName,
            prefix
          });
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
          console.log('S3 folder contents loaded:', this.s3Contents);
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
      console.error('Invalid download URL');
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
      console.error('Invalid parameters:', { downloadUrl, fileName });
      this.oneDriveErrorMessage = 'Invalid file details.';
      return;
    }

    console.log('Downloading file:', fileName);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  downloadFolder(folderName: string): void {
    if (!folderName || !this.email) {
      this.oneDriveErrorMessage = 'Invalid folder or user details.';
      console.error('Invalid parameters:', { folderName, email: this.email });
      return;
    }

    const folderPath = this.currentPath ? `${this.currentPath}/${folderName}` : folderName;
    const url = `https://datakavach.com/onedrive/download-folder?username=${encodeURIComponent(this.email)}&folderPath=${encodeURIComponent(folderPath)}`;

    this.http
      .get(url, { headers: this.getAuthHeaders(), responseType: 'blob' })
      .pipe(
        retry({
          count: 2,
          delay: 1000
        }),
        catchError((err) => {
          let errorMessage = 'Failed to download folder. Please try again.';
          if (err.status === 401) {
            errorMessage = 'Authentication failed. Please log in again.';
          } else if (err.status === 404) {
            errorMessage = `Folder "${folderPath}" not found.`;
          }
          this.oneDriveErrorMessage = errorMessage;
          console.error(`Error downloading folder: ${errorMessage}`, err);
          return throwError(() => new Error(errorMessage));
        })
      )
      .subscribe({
        next: (response) => {
          const blob = new Blob([response], { type: 'application/zip' });
          saveAs(blob, `${folderName}.zip`);
          console.log(`Folder "${folderName}" downloaded successfully.`);
        }
      });
  }

  ngOnDestroy(): void {
    this.bucketSubscription?.unsubscribe();
    this.contentsSubscription?.unsubscribe();
    this.folderSubscription?.unsubscribe();
  }
}