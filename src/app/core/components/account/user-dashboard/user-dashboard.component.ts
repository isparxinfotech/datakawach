import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  folderName: string = '';
  cloudProvider: string = ''; // Store cloudProvider from session
  oneDriveFiles: { name: string, id: string, downloadUrl: string }[] = [];
  loadingOneDrive: boolean = false;
  oneDriveErrorMessage: string = '';
  
  buckets: any[] = [];
  s3Contents: any[] = [];
  selectedBucket: string = '';
  loadingS3: boolean = false;
  s3ErrorMessage: string = '';
  bucketSubscription?: Subscription;
  contentsSubscription?: Subscription;

  constructor(private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails?.username && this.userSessionDetails?.cloudProvider) {
      this.email = this.userSessionDetails.username;
      this.cloudProvider = this.userSessionDetails.cloudProvider.toLowerCase(); // Normalize to lowercase
      console.log('Cloud provider from session:', this.cloudProvider);

      // Load data based on cloudProvider
      if (this.cloudProvider === 'aws') {
        this.loadS3Buckets();
      } else if (this.cloudProvider === 'onedrive') {
        this.folderName = this.email; // Default folderName to email for OneDrive
        this.listOneDriveFiles(); // Auto-load OneDrive files
      } else {
        console.error('Unsupported cloud provider:', this.cloudProvider);
      }
    } else {
      console.error('User session details incomplete:', this.userSessionDetails);
    }
  }

  // OneDrive file listing
  listOneDriveFiles(): void {
    if (!this.email || !this.folderName) {
      this.oneDriveErrorMessage = 'Please provide both email and folder name.';
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveFiles = [];

    const url = `https://datakavach.com:8080/onedrive/files?email=${encodeURIComponent(this.email)}&folderName=${encodeURIComponent(this.folderName)}`;
    this.http.get<any[]>(url).subscribe({
      next: (response) => {
        this.oneDriveFiles = response;
        this.loadingOneDrive = false;
        if (this.oneDriveFiles.length === 0) {
          this.oneDriveErrorMessage = 'No files found in the specified folder.';
        }
      },
      error: (err) => {
        this.loadingOneDrive = false;
        this.oneDriveErrorMessage = err.error?.message || 'Failed to list files. Please try again.';
        console.error('Error listing OneDrive files:', err);
      }
    });
  }

  // Load S3 buckets
  loadS3Buckets(): void {
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.buckets = [];

    const url = `https://datakavach.com:8080/api/s3/buckets?email=${encodeURIComponent(this.email)}`;
    this.bucketSubscription = this.http.get<any[]>(url).subscribe({
      next: (response) => {
        this.buckets = response.map(bucketName => ({
          name: bucketName,
          region: 'Unknown', // Adjust if backend provides region
          size: 0,           // Adjust if backend provides size
          objectCount: 0,    // Adjust if backend provides count
          creationDate: 'N/A' // Adjust if backend provides date
        }));
        this.loadingS3 = false;
        console.log('S3 buckets loaded:', this.buckets);
      },
      error: (err) => {
        this.loadingS3 = false;
        this.s3ErrorMessage = err.error?.message || 'Failed to load S3 buckets.';
        console.error('Error loading S3 buckets:', err);
        this.buckets = [];
      }
    });
  }

  // List contents of an S3 bucket
  listS3BucketContents(bucketName: string): void {
    this.selectedBucket = bucketName;
    this.loadS3Contents(bucketName, '');
  }

  // List contents of an S3 folder (prefix)
  listS3FolderContents(bucketName: string, prefix: string): void {
    this.selectedBucket = bucketName;
    this.loadS3Contents(bucketName, prefix);
  }

  // Helper method to load S3 contents
  private loadS3Contents(bucketName: string, prefix: string): void {
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.s3Contents = [];

    const url = `https://datakavach.com:8080/api/s3/files?email=${encodeURIComponent(this.email)}&bucketName=${encodeURIComponent(bucketName)}${prefix ? '&prefix=' + encodeURIComponent(prefix) : ''}`;
    this.contentsSubscription = this.http.get<any[]>(url).subscribe({
      next: (response) => {
        this.s3Contents = response.map(item => ({
          name: item.name,
          type: 'file', // Adjust if backend distinguishes folders
          size: item.size || 0,
          downloadUrl: item.downloadUrl
        }));
        this.loadingS3 = false;
        if (this.s3Contents.length === 0) {
          this.s3ErrorMessage = `No contents found in "${bucketName}/${prefix || ''}".`;
        }
      },
      error: (err) => {
        this.loadingS3 = false;
        this.s3ErrorMessage = err.error?.message || 'Failed to list bucket contents.';
        console.error('Error listing S3 contents:', err);
      }
    });
  }

  // View file (used for both OneDrive and S3)
  viewFile(downloadUrl: string): void {
    window.open(downloadUrl, '_blank');
  }

  // Format size from bytes to human-readable
  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  ngOnDestroy(): void {
    if (this.bucketSubscription) {
      this.bucketSubscription.unsubscribe();
    }
    if (this.contentsSubscription) {
      this.contentsSubscription.unsubscribe();
    }
  }
}