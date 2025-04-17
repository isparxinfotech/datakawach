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

  // OTP-related properties
  showOtpModal: boolean = false;
  otpInput: string = '';
  otpErrorMessage: string = '';
  selectedFileDownloadUrl: string = '';
  selectedFileName: string = '';

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
          name: item.name,
          type: 'file',
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

  toggleSidebar(): void {
    const sidebar = document.querySelector('#bdSidebar');
    if (sidebar) {
      sidebar.classList.toggle('show');
    }
  }

  viewFile(downloadUrl: string): void {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = '';
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

  // OTP-related methods
  requestOtpForDownload(downloadUrl: string, fileName: string): void {
    this.selectedFileDownloadUrl = downloadUrl;
    this.selectedFileName = fileName;
    this.otpInput = '';
    this.otpErrorMessage = '';

    const url = `https://datakavach.com/onedrive/generate-otp?email=${encodeURIComponent(this.email)}`;
    this.http.post<any>(url, {}).subscribe({
      next: (response) => {
        this.showOtpModal = true;
        // Focus OTP input after modal is rendered
        setTimeout(() => {
          const otpInput = document.getElementById('otpInput') as HTMLInputElement;
          if (otpInput) {
            otpInput.focus();
          }
        }, 100);
        console.log('OTP sent to email:', this.email);
      },
      error: (err) => {
        this.otpErrorMessage = err.error?.message || 'Failed to send OTP. Please try again.';
        console.error('Error requesting OTP:', err);
      }
    });
  }

  verifyOtpAndDownload(): void {
    if (!this.otpInput) {
      this.otpErrorMessage = 'Please enter the OTP.';
      return;
    }

    const url = `https://datakavach.com/onedrive/verify-otp?email=${encodeURIComponent(this.email)}&otp=${encodeURIComponent(this.otpInput)}`;
    this.http.post<any>(url, {}).subscribe({
      next: (response) => {
        if (response.valid) {
          this.showOtpModal = false;
          this.otpInput = '';
          this.otpErrorMessage = '';
          const link = document.createElement('a');
          link.href = this.selectedFileDownloadUrl;
          link.download = this.selectedFileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } else {
          this.otpErrorMessage = 'Invalid or expired OTP. Please try again.';
        }
      },
      error: (err) => {
        this.otpErrorMessage = err.error?.message || 'Failed to verify OTP. Please try again.';
        console.error('Error verifying OTP:', err);
      }
    });
  }

  closeOtpModal(): void {
    this.showOtpModal = false;
    this.otpInput = '';
    this.otpErrorMessage = '';
    this.selectedFileDownloadUrl = '';
    this.selectedFileName = '';
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