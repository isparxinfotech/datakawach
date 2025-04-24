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
  fileName: string = '';
  fileNameError: string = '';
  localPath: string = '';
  backupTime: string = '';
  retentionDays: number = 7;
  backupFrequency: string = 'Daily';
  dayOfWeek: string = '';
  dayOfMonth: number | null = null;
  selectedFile: File | null = null;
  uploading: boolean = false;
  scheduling: boolean = false;
  overallProgress: number = 0;
  chunkProgress: number = 0;
  message: string = '';
  isSuccess: boolean = false;
  userSessionDetails: userSessionDetails | null = null;
  private readonly CHUNK_SIZE = 20 * 1024 * 1024; // 20MB chunks
  private uploadSessionId: string | null = null;
  userInfo: PersonalInfoRequest[] = [];
  private usersSubscription?: Subscription;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private superAdminService: SuperAdminService
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails() || {
      statusCode: '200',
      jwtToken: '',
      username: 'JohnDoe@example.com',
      resourcePermission: [],
      userType: 0,
      roleid: 0,
      cloudProvider: undefined
    };
    if (this.userSessionDetails) {
      this.getUsersList();
    }
  }

  validateFileNameInput(): void {
    if (this.fileName.includes(' ')) {
      this.fileNameError = 'File name cannot contain spaces. Use underscores instead.';
      this.fileName = this.sanitizeFileName(this.fileName);
    } else {
      this.fileNameError = '';
    }
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    this.message = '';
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.uploadSessionId = null;
    console.log('File selected:', this.selectedFile?.name, 'Size:', this.selectedFile?.size, 'Type:', this.selectedFile?.type);

    if (this.selectedFile && this.selectedFile.name.includes(' ')) {
      this.message = 'Selected file name cannot contain spaces. Renaming to: ' + this.sanitizeFileName(this.selectedFile.name);
      this.isSuccess = false;
      this.fileName = this.sanitizeFileName(this.selectedFile.name);
    }
  }

  isScheduleFormValid(): boolean {
    return !!(
      this.userSessionDetails?.username &&
      this.folderName &&
      this.fileName &&
      !this.fileName.includes(' ') &&
      this.localPath &&
      this.backupTime &&
      this.retentionDays > 0 &&
      this.backupFrequency &&
      (this.backupFrequency !== 'Weekly' || this.dayOfWeek) &&
      (this.backupFrequency !== 'Monthly' || this.dayOfMonth)
    );
  }

  async onCreateSchedule() {
    if (!this.isScheduleFormValid()) {
      this.message = 'Please fill all required fields correctly';
      this.isSuccess = false;
      return;
    }

    this.scheduling = true;
    this.message = '';

    const sanitizedFileName = this.sanitizeFileName(this.fileName);
    const url = 'https://datakavach.com/onedrive/schedule';
    const body = new FormData();
    body.append('email', this.userSessionDetails!.username);
    body.append('folderName', this.folderName);
    body.append('fileName', sanitizedFileName);
    body.append('localPath', this.localPath);
    body.append('backupTime', this.backupTime);
    body.append('retentionDays', this.retentionDays.toString());
    body.append('backupFrequency', this.backupFrequency);
    if (this.dayOfWeek) body.append('dayOfWeek', this.dayOfWeek);
    if (this.dayOfMonth) body.append('dayOfMonth', this.dayOfMonth.toString());

    try {
      await this.http.post(url, body, { responseType: 'text' }).toPromise();
      this.message = 'Backup schedule created successfully';
      this.isSuccess = true;

      if (this.selectedFile) {
        await this.onUpload(sanitizedFileName);
      } else {
        this.handleSuccess('Backup schedule created without immediate upload');
      }
    } catch (err: any) {
      this.handleError(err);
    } finally {
      this.scheduling = false;
    }
  }

  onFrequencyChange() {
    this.dayOfWeek = '';
    this.dayOfMonth = null;
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_/, '')
      .replace(/_$/, '');
  }

  async onUpload(providedFileName?: string) {
    if (!this.userSessionDetails?.username || !this.folderName || (!this.selectedFile && !providedFileName)) {
      this.message = 'Please provide a folder name and file for upload';
      this.isSuccess = false;
      this.uploading = false;
      return;
    }

    this.uploading = true;
    this.overallProgress = 0;
    this.chunkProgress = 0;
    this.message = '';

    const rawFileName = providedFileName || this.selectedFile!.name;
    const sanitizedFileName = this.sanitizeFileName(rawFileName);
    const fileSize = this.selectedFile?.size || 0;
    const totalChunks = Math.ceil(fileSize / this.CHUNK_SIZE);

    console.log(`Starting upload: ${sanitizedFileName}, Size: ${fileSize} bytes, Total chunks: ${totalChunks}`);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const startByte = chunkIndex * this.CHUNK_SIZE;
      const endByte = Math.min(startByte + this.CHUNK_SIZE - 1, fileSize - 1);
      const chunk = this.selectedFile!.slice(startByte, endByte + 1);
      const chunkSize = endByte - startByte + 1;

      console.log(`Processing chunk ${chunkIndex + 1}/${totalChunks}, Bytes: ${startByte}-${endByte}, Size: ${chunkSize} bytes`);

      const formData = new FormData();
      formData.append('email', this.userSessionDetails!.username);
      formData.append('folderName', this.folderName);
      formData.append('file', chunk, sanitizedFileName);
      formData.append('chunkIndex', chunkIndex.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('startByte', startByte.toString());
      formData.append('endByte', endByte.toString());
      formData.append('totalSize', fileSize.toString());
      if (this.uploadSessionId) {
        formData.append('sessionId', this.uploadSessionId);
      }

      const url = `https://datakavach.com/onedrive/upload/${encodeURIComponent(sanitizedFileName)}`;

      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          const response = await this.uploadChunk(url, formData, chunkIndex, totalChunks, fileSize);
          if (chunkIndex === 0 && response.sessionId) {
            this.uploadSessionId = response.sessionId;
          }
          break; // Success, exit retry loop
        } catch (err: any) {
          if (err.status === 400 && err.error?.message.includes('session expired') && retryCount < maxRetries) {
            // Session expired, clear sessionId and retry
            this.uploadSessionId = null;
            retryCount++;
            console.warn(`Session expired, retrying chunk ${chunkIndex + 1}/${totalChunks} (Attempt ${retryCount + 1})`);
            continue;
          }
          this.handleError(err);
          return;
        }
      }
    }

    this.handleSuccess('File uploaded successfully');
  }

  private uploadChunk(url: string, formData: FormData, chunkIndex: number, totalChunks: number, totalSize: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.http.put(url, formData, {
        reportProgress: true,
        observe: 'events'
      }).subscribe({
        next: (event: any) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.chunkProgress = Math.round(100 * event.loaded / event.total);
            this.overallProgress = Math.round(((chunkIndex * this.CHUNK_SIZE + event.loaded) / totalSize) * 100);
            console.log(`Chunk ${chunkIndex + 1} progress: ${this.chunkProgress}% | Overall: ${this.overallProgress}%`);
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
    this.scheduling = false;
    this.isSuccess = true;
    this.message = typeof response === 'string' ? response : 'Operation completed successfully!';
    this.resetForm();
    console.log('Success:', response);
  }

  private handleError(error: any) {
    this.uploading = false;
    this.scheduling = false;
    this.isSuccess = false;

    if (error.status === 404) {
      this.message = 'Endpoint not found. Please check the server configuration.';
    } else if (error.status === 400) {
      this.message = error.error?.message || 'Operation failed due to a bad request.';
    } else if (error.status === 401) {
      this.message = 'Unauthorized. Please check authentication credentials.';
    } else if (error.status === 405) {
      this.message = 'Method not allowed. Server does not support this operation.';
    } else if (error.status === 413) {
      this.message = 'Content too large. Server rejected chunk. Try reducing chunk size.';
    } else {
      this.message = error.error?.message || 'Operation failed. Please try again.';
    }

    console.error('Error:', error);
  }

  private resetForm() {
    this.folderName = '';
    this.fileName = '';
    this.fileNameError = '';
    this.localPath = '';
    this.backupTime = '';
    this.retentionDays = 7;
    this.backupFrequency = 'Daily';
    this.dayOfWeek = '';
    this.dayOfMonth = null;
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
    this.userSessionDetails.userType = 5;
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
            userType: Number(item.userType) || 0
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