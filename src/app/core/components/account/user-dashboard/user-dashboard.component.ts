import { Component, OnInit, OnDestroy, AfterViewChecked, ViewChild, ElementRef, Renderer2 } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

interface OneDriveFolder {
  name: string;
  id: string;
  size: number;
}

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit, OnDestroy, AfterViewChecked {
  userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  folderName: string = '';
  cloudProvider: string = '';
  oneDriveFiles: { name: string, id: string, downloadUrl: string }[] = [];
  oneDriveFolders: OneDriveFolder[] = [];
  loadingOneDrive: boolean = false;
  oneDriveErrorMessage: string = '';
  buckets: any[] = [];
  s3Contents: any[] = [];
  selectedBucket: string = '';
  loadingS3: boolean = false;
  s3ErrorMessage: string = '';
  bucketSubscription?: Subscription;
  contentsSubscription?: Subscription;
  folderSubscription?: Subscription;
  showOtpModal: boolean = false;
  otpInput: string = '';
  otpErrorMessage: string = '';
  selectedFileDownloadUrl: string = '';
  selectedFileName: string = '';
  loadingOtp: boolean = false;

  @ViewChild('otpInputElement') otpInputRef: ElementRef | undefined;

  constructor(private authService: AuthService, private http: HttpClient, private renderer: Renderer2) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();

    if (!this.userSessionDetails) {
      console.warn('No user session found. Skipping dashboard load.');
      return;
    }

    const { username, cloudProvider } = this.userSessionDetails;

    if (!username || !cloudProvider) {
      console.error('User session details incomplete:', this.userSessionDetails);
      return;
    }

    this.email = username;
    this.cloudProvider = cloudProvider.toLowerCase();

    if (this.cloudProvider === 'aws') {
      this.loadS3Buckets();
    } else if (this.cloudProvider === 'onedrive') {
      this.loadOneDriveFolders();
    } else {
      console.warn('Unsupported cloud provider:', this.cloudProvider);
    }
  }

  ngAfterViewChecked(): void {
    if (this.showOtpModal && this.otpInputRef) {
      console.log('Modal rendered, focusing OTP input');
      this.renderer.selectRootElement(this.otpInputRef.nativeElement).focus();
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.userSessionDetails?.jwtToken || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  loadOneDriveFolders(): void {
    if (!this.email) {
      this.oneDriveErrorMessage = 'User email is missing.';
      console.error('No email available for folder fetch');
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveFolders = [];

    const url = `https://datakavach.com/onedrive/folders?email=${encodeURIComponent(this.email)}`;
    this.folderSubscription = this.http.get<OneDriveFolder[]>(url, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: (response) => {
        this.oneDriveFolders = response || [];
        this.loadingOneDrive = false;
        console.log('OneDrive folders loaded:', this.oneDriveFolders);
        if (this.oneDriveFolders.length === 0) {
          this.oneDriveErrorMessage = 'No folders found in OneDrive.';
        }
      },
      error: (err) => {
        this.loadingOneDrive = false;
        this.oneDriveErrorMessage = err.error?.message || 'Failed to fetch folders. Check CORS or network.';
        console.error('OneDrive folder error:', err);
      }
    });
  }

  listOneDriveFiles(): void {
    if (!this.email || !this.folderName) {
      this.oneDriveErrorMessage = 'Email or folder name missing.';
      return;
    }

    this.loadingOneDrive = true;
    this.oneDriveErrorMessage = '';
    this.oneDriveFiles = [];

    const url = `https://datakavach.com/onedrive/files?email=${encodeURIComponent(this.email)}&folderName=${encodeURIComponent(this.folderName)}`;
    this.http.get<any[]>(url, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: (response) => {
        this.oneDriveFiles = response;
        this.loadingOneDrive = false;
        if (this.oneDriveFiles.length === 0) {
          this.oneDriveErrorMessage = 'No files found.';
        }
      },
      error: (err) => {
        this.loadingOneDrive = false;
        this.oneDriveErrorMessage = err.error?.message || 'Failed to fetch files. Check CORS or network.';
        console.error('OneDrive error:', err);
      }
    });
  }

  loadS3Buckets(): void {
    this.loadingS3 = true;
    this.s3ErrorMessage = '';
    this.buckets = [];

    const url = `https://datakavach.com/api/s3/buckets?email=${encodeURIComponent(this.email)}`;
    this.bucketSubscription = this.http.get<any[]>(url, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: (response) => {
        this.buckets = response.map(bucketName => ({
          name: bucketName,
          region: 'Unknown',
          size: 0,
          objectCount: 0,
          creationDate: 'N/A'
        }));
        this.loadingS3 = false;
      },
      error: (err) => {
        this.loadingS3 = false;
        this.s3ErrorMessage = err.error?.message || 'Error fetching buckets. Check CORS or network.';
        console.error('S3 bucket error:', err);
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
    this.contentsSubscription = this.http.get<any[]>(url, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: (response) => {
        this.s3Contents = response.map(item => ({
          name: item.name,
          type: item.prefix ? 'folder' : 'file',
          size: item.size || 0,
          downloadUrl: item.downloadUrl,
          prefix: item.prefix
        }));
        this.loadingS3 = false;
        if (this.s3Contents.length === 0) {
          this.s3ErrorMessage = `No contents found in "${bucketName}/${prefix || ''}".`;
        }
      },
      error: (err) => {
        this.loadingS3 = false;
        this.s3ErrorMessage = err.error?.message || 'Error fetching contents. Check CORS or network.';
        console.error('S3 content error:', err);
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
      return;
    }
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

  requestOtpForDownload(downloadUrl: string, fileName: string): void {
    if (!downloadUrl || !fileName || !this.email) {
      this.otpErrorMessage = 'Invalid file or user details.';
      console.error('Invalid parameters:', { downloadUrl, fileName, email: this.email });
      return;
    }

    this.loadingOtp = true;
    this.selectedFileDownloadUrl = downloadUrl;
    this.selectedFileName = fileName;
    this.otpInput = '';
    this.otpErrorMessage = '';

    console.log('Requesting OTP for:', { email: this.email, fileName });

    if (document.activeElement) {
      (document.activeElement as HTMLElement).blur();
    }

    const url = `https://datakavach.com/onedrive/generate-otp?email=${encodeURIComponent(this.email)}`;
    this.http.post<any>(url, {}, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: () => {
        this.loadingOtp = false;
        setTimeout(() => {
          this.showOtpModal = true;
          console.log('OTP modal opened for:', this.email);
        }, 0);
      },
      error: (err) => {
        this.loadingOtp = false;
        this.otpErrorMessage = err.error?.message || 'Failed to request OTP. Check CORS or network.';
        console.error('OTP request error:', err);
      }
    });
  }

  verifyOtpAndDownload(): void {
    if (!this.otpInput) {
      this.otpErrorMessage = 'Please enter the OTP.';
      return;
    }

    if (!this.selectedFileDownloadUrl || !this.selectedFileName) {
      this.otpErrorMessage = 'No file selected for download.';
      this.showOtpModal = false;
      console.error('No file selected for download');
      return;
    }

    this.loadingOtp = true;
    this.otpErrorMessage = '';

    console.log('Verifying OTP:', { email: this.email, otp: this.otpInput });

    const url = `https://datakavach.com/onedrive/verify-otp?email=${encodeURIComponent(this.email)}&otp=${encodeURIComponent(this.otpInput)}`;
    this.http.post<any>(url, {}, {
      headers: this.getAuthHeaders()
    }).subscribe({
      next: (response) => {
        this.loadingOtp = false;
        if (response.valid) {
          console.log('OTP verified successfully, downloading:', this.selectedFileName);
          const link = document.createElement('a');
          link.href = this.selectedFileDownloadUrl;
          link.download = this.selectedFileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          this.closeOtpModal();
        } else {
          this.otpErrorMessage = 'Invalid or expired OTP.';
          console.warn('OTP verification failed: Invalid OTP');
        }
      },
      error: (err) => {
        this.loadingOtp = false;
        this.otpErrorMessage = err.error?.message || 'OTP verification failed. Check CORS or network.';
        console.error('OTP verify error:', err);
      }
    });
  }

  closeOtpModal(): void {
    this.showOtpModal = false;
    this.otpInput = '';
    this.otpErrorMessage = '';
    this.selectedFileDownloadUrl = '';
    this.selectedFileName = '';
    this.loadingOtp = false;
    console.log('OTP modal closed');
  }

  ngOnDestroy(): void {
    this.bucketSubscription?.unsubscribe();
    this.contentsSubscription?.unsubscribe();
    this.folderSubscription?.unsubscribe();
  }
}