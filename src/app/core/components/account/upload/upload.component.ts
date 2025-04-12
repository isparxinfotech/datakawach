import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Subscription } from 'rxjs';
import { SuperAdminService } from 'src/app/services/super-admin.service';
import { PersonalInfoRequest } from 'src/app/models/personal-info-request.model';

@Component({
  selector: 'app-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.css']
})
export class UploadComponent implements OnInit, OnDestroy {
  folderName: string = '';
  selectedFile: File | null = null;
  uploading: boolean = false;
  overallProgress: number = 0;
  chunkProgress: number = 0;
  message: string = '';
  isSuccess: boolean = false;
  userSessionDetails: userSessionDetails | null = null;
  private readonly CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks
  private uploadSessionId: string | null = null; // To store session ID
  userInfo: PersonalInfoRequest[] = [];
  private usersSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private superAdminService: SuperAdminService
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails() || {
      statusCode: '200', // Matches string type
      jwtToken: '',      // Empty token as fallback
      username: 'JohnDoe', // Default username
      resourcePermission: [], // Empty array as fallback (adjust if resourcePermission has a specific structure)
      userType: 0,       // Default user type
      roleid: 0,         // Default role ID
      cloudProvider: undefined // Optional, default to undefined
    };
    if (this.userSessionDetails) {
      this.getUsersList(); // Fetch user list if needed
    }
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    this.message = '';
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.uploadSessionId = null;
    console.log('File selected:', this.selectedFile?.name, 'Size:', this.selectedFile?.size, 'Type:', this.selectedFile?.type);
  }

  async onUpload() {
    if (!this.userSessionDetails?.username || !this.folderName || !this.selectedFile) {
      this.message = 'Please select a folder name and file';
      this.isSuccess = false;
      return;
    }

    this.uploading = true;
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.message = '';

    const fileSize = this.selectedFile.size;
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);
    const fileName = encodeURIComponent(this.selectedFile.name);
    const url = `https://datakavach.com/onedrive/upload/${fileName}`;

    console.log(`Starting upload: ${fileName}, Size: ${fileSize} bytes, Total chunks: ${totalChunks}`);

    let start = 0;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const end = Math.min(start + this.CHUNK_SIZE, fileSize);
      const chunk = this.selectedFile.slice(start, end);
      const chunkSize = end - start;

      console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks}, Bytes: ${start}-${end - 1}, Size: ${chunkSize} bytes`);

      const formData = new FormData();
      formData.append('email', this.userSessionDetails.username);
      formData.append('folderName', this.folderName);
      formData.append('file', chunk, this.selectedFile.name);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('startByte', start.toString());
      formData.append('endByte', (end - 1).toString());
      formData.append('totalSize', fileSize.toString());
      if (this.uploadSessionId) {
        formData.append('sessionId', this.uploadSessionId);
      }

      try {
        const response = await this.uploadChunk(url, formData);
        if (chunkIndex === 0 && response.sessionId) {
          this.uploadSessionId = response.sessionId;
        }
        start = end;
        this.overallProgress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
      } catch (err: any) {
        this.handleError(err);
        return;
      }
    }

    this.handleSuccess('File uploaded successfully');
  }

  private uploadChunk(url: string, formData: FormData): Promise<any> {
    return new Promise((resolve, reject) => {
      this.http.put(url, formData, {
        reportProgress: true,
        observe: 'events'
      }).subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.chunkProgress = Math.round(100 * event.loaded / event.total);
            console.log(`Chunk progress: ${this.chunkProgress}%`);
          } else if (event.type === HttpEventType.Response) {
            console.log('Chunk uploaded successfully:', event.body);
            resolve(event.body);
          }
        },
        error: (err) => {
          console.error('Chunk upload failed:', err);
          reject(err);
        }
      });
    });
  }

  private handleSuccess(response: any) {
    this.uploading = false;
    this.isSuccess = true;
    this.message = typeof response === 'string' ? response : 'File uploaded successfully to OneDrive!';
    this.resetForm();
    console.log('Upload successful:', response);
  }

  private handleError(error: any) {
    this.uploading = false;
    this.isSuccess = false;

    if (error.status === 404) {
      this.message = 'Upload endpoint not found. Please check the server configuration.';
    } else if (error.status === 400) {
      this.message = error.error?.message || 'Upload failed due to a bad request.';
    } else if (error.status === 401) {
      this.message = 'Unauthorized. Please check authentication credentials.';
    } else if (error.status === 405) {
      this.message = 'Method not allowed. Server does not support PUT.';
    } else if (error.status === 413) {
      this.message = 'Content too large. Server rejected chunk. Try reducing chunk size.';
    } else {
      this.message = error.error?.message || 'Upload failed. Please try again.';
    }

    console.error('Upload error:', error);
  }

  private resetForm() {
    this.folderName = '';
    this.selectedFile = null;
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.uploadSessionId = null;
    setTimeout(() => this.message = '', 5000);
  }

  private getUsersList() {
    if (!this.userSessionDetails) {
      return;
    }
    this.userSessionDetails.userType = 5; // Matches UserAccountListComponent
    this.usersSubscription = this.superAdminService.getUsersList(this.userSessionDetails)
      .subscribe(
        (response) => {
          console.log('User list fetched:', response);
          this.userInfo = (response.userInfo as any[]).map(item => ({
            userid: item.userid || '',
            firstName: item.firstName || '',
            middleName: item.middleName || '',
            lastName: item.lastName || '',
            gender: item.gender || '',
            dateOfBirth: item.dateOfBirth ? new Date(item.dateOfBirth) : null,
            address: item.address || '',
            city: item.city || '',
            pinCode: item.pinCode || '',
            mobileNumber: item.mobileNumber || '',
            email: item.email || '',
            corpoName: item.corpoName || '',
            branch: item.branch || '',
            landlineNumber: item.landlineNumber || '',
            userType: Number(item.userType) || 0,
            ipAddress: item.ip_address || item.ipAddress || ''
          }));
          console.log('Mapped userInfo:', this.userInfo);
          if (this.userInfo.length > 0) {
            this.userInfo.reverse();
          }
        },
        (error) => {
          console.error('Error fetching user list:', error);
        }
      );
  }

  ngOnDestroy(): void {
    this.usersSubscription?.unsubscribe();
  }
}