import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import * as bootstrap from 'bootstrap';

@Component({
  selector: 'app-coadmin-dashboard',
  templateUrl: './coadmin-dashboard.component.html',
  styleUrls: ['./coadmin-dashboard.component.css']
})
export class CoadminDashboardComponent {
 userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  folderName: string = '';
  cloudProvider: string = '';
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
      this.cloudProvider = this.userSessionDetails.cloudProvider.toLowerCase();
      console.log('Cloud provider from session:', this.cloudProvider);

      if (this.cloudProvider === 'aws') {
        this.loadS3Buckets();
      } else if (this.cloudProvider === 'onedrive') {
        this.folderName = this.email;
        this.listOneDriveFiles();
      } else {
        console.error('Unsupported cloud provider:', this.cloudProvider);
      }
    } else {
      console.error('User session details incomplete:', this.userSessionDetails);
    }
  }

  listOneDriveFiles(): void {
    if (!this.email || !this.folderName) {
      this.oneDriveErrorMessage = 'Please provide both email and folder name.';
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveFiles = [];

    const url = `https://datakavach.com/onedrive/files?email=${encodeURIComponent(this.email)}&folderName=${encodeURIComponent(this.folderName)}`;
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

  loadS3Buckets(): void {
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.buckets = [];

    const url = `https://datakavach.com/api/s3/buckets?email=${encodeURIComponent(this.email)}`;
    this.bucketSubscription = this.http.get<any[]>(url).subscribe({
      next: (response) => {
        this.buckets = response.map(bucketName => ({
          name: bucketName,
          region: 'Unknown',
          size: 0,
          objectCount: 0,
          creationDate: 'N/A'
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

  listS3BucketContents(bucketName: string): void {
    this.selectedBucket = bucketName;
    this.loadS3Contents(bucketName, '');
  }

  listS3FolderContents(bucketName: string, prefix: string): void {
    this.selectedBucket = bucketName;
    this.loadS3Contents(bucketName, prefix);
  }

  private loadS3Contents(bucketName: string, prefix: string): void {
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.s3Contents = [];

    const url = `https://datakavach.com/api/s3/files?email=${encodeURIComponent(this.email)}&bucketName=${encodeURIComponent(bucketName)}${prefix ? '&prefix=' + encodeURIComponent(prefix) : ''}`;
    this.contentsSubscription = this.http.get<any[]>(url).subscribe({
      next: (response) => {
        this.s3Contents = response.map(item => ({
          name: item.fileName, // Map fileName to name
          type: item.key.endsWith('/') ? 'folder' : 'file',
          size: item.size || 0, // Use size from backend
          downloadUrl: item.downloadUrl
        }));
        this.loadingS3 = false;
        if (this.s3Contents.length === 0) {
          this.s3ErrorMessage = `No contents found in "${bucketName}/${prefix || ''}".`;
        }
        const modalElement = document.getElementById('s3BucketModal');
        if (modalElement) {
          const modal = new bootstrap.Modal(modalElement);
          modal.show();
        }
      },
      error: (err) => {
        this.loadingS3 = false;
        this.s3ErrorMessage = err.error?.message || 'Failed to list bucket contents.';
        console.error('Error listing S3 contents:', err);
      }
    });
  }

  viewFile(downloadUrl: string): void {
    window.open(downloadUrl, '_blank');
  }

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