import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Socket } from 'ngx-socket-io';

@Component({
  selector: 'app-upload-to-cloud',
  templateUrl: './upload-to-cloud.component.html',
  styleUrls: ['./upload-to-cloud.component.css']
})
export class UploadToCloudComponent implements OnInit {
  buckets: string[] = [];
  selectedBucket: string = '';
  folders: string[] = [];
  files: string[] = [];
  currentPath: string = '';
  userSessionDetails: userSessionDetails | null = null;
  filesToUpload: File[] = [];
  result: string = '';
  loading: boolean = false;
  uploadProgress: { [key: string]: number } = {};
  uploadDetails: { name: string; uploadTime: string; size: number }[] = [];
  logs: string[] = [];
  sessionId: string = Math.random().toString(36).substring(2); // Unique session ID
  fileDownloadUrls: { [key: string]: string } = {};

  @ViewChild('logContainer') logContainer!: ElementRef;

  constructor(
    private authService: AuthService,
    private socket: Socket,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails && this.userSessionDetails.username) {
      this.addLog('Initializing component with user: ' + this.userSessionDetails.username);
      this.loadBuckets();
      this.setupWebSocket();
    } else {
      this.result = 'User not logged in or email not available.';
      this.addLog('Error: User session details not available', true);
    }
  }

  setupWebSocket() {
    this.socket.fromEvent(`/topic/upload-progress/${this.sessionId}`).subscribe((data: any) => {
      const { fileName, progress } = data;
      this.uploadProgress[fileName] = progress;
      if (progress === -1) {
        this.addLog(`Error uploading ${fileName}`, true);
        this.result = this.result ? `${this.result}\nError: ${fileName} failed` : `Error: ${fileName} failed`;
      } else if (progress === 100) {
        this.addLog(`Upload completed for ${fileName}`);
      } else {
        this.addLog(`Progress for ${fileName}: ${progress}%`);
      }
      this.cdr.detectChanges(); // Force UI update
    });
  }

  addLog(message: string, isError: boolean = false) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${isError ? 'ERROR: ' : ''}${message}`;
    this.logs.push(logMessage);
    setTimeout(() => {
      if (this.logContainer) {
        this.logContainer.nativeElement.scrollTop = this.logContainer.nativeElement.scrollHeight;
      }
    }, 0);
  }

  clearLogs() {
    this.logs = [];
    this.addLog('Logs cleared');
  }

  loadBuckets() {
    if (!this.userSessionDetails?.username) {
      this.result = 'User email not available.';
      this.addLog('No email in userSessionDetails', true);
      return;
    }

    this.loading = true;
    this.addLog('Loading buckets...');
    const url = `http://localhost:8080/api/s3/buckets?email=${encodeURIComponent(this.userSessionDetails.username)}`;
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch buckets');
        return response.json();
      })
      .then((data: string[]) => {
        this.buckets = data;
        this.addLog(`Loaded ${this.buckets.length} buckets: ${this.buckets.join(', ')}`);
        if (this.buckets.length > 0) {
          this.selectedBucket = this.buckets[0];
          this.loadFolders();
        }
      })
      .catch(error => {
        this.result = `Failed to load buckets: ${error.message}`;
        this.addLog(`Error loading buckets: ${error.message}`, true);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  loadFolders() {
    if (!this.selectedBucket || !this.userSessionDetails?.username) {
      this.result = !this.selectedBucket ? 'No bucket selected.' : 'User email not available.';
      this.addLog('Missing required data for loadFolders', true);
      return;
    }

    this.loading = true;
    this.addLog(`Loading folders for bucket: ${this.selectedBucket}, path: ${this.currentPath || '/'}`);
    const url = `http://localhost:8080/api/s3/folders?email=${encodeURIComponent(this.userSessionDetails.username)}&bucketName=${encodeURIComponent(this.selectedBucket)}${this.currentPath ? '&prefix=' + encodeURIComponent(this.currentPath) : ''}`;
    fetch(url)
      .then(async response => {
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch folders: ${response.status} - ${errorText}`);
        }
        return response.json();
      })
      .then((data: { folders: string[]; files: string[] }) => {
        this.folders = data.folders;
        this.files = data.files;
        this.addLog(`Loaded ${this.folders.length} folders and ${this.files.length} files`);
        this.loadFileDownloadUrls();
      })
      .catch(error => {
        this.result = error.message;
        this.addLog(`Error loading folders: ${error.message}`, true);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  loadFileDownloadUrls() {
    if (!this.selectedBucket || !this.userSessionDetails?.username) return;

    const url = `http://localhost:8080/api/s3/files?email=${encodeURIComponent(this.userSessionDetails.username)}&bucketName=${encodeURIComponent(this.selectedBucket)}${this.currentPath ? '&prefix=' + encodeURIComponent(this.currentPath) : ''}`;
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch file URLs');
        return response.json();
      })
      .then((data: { name: string; id: string; downloadUrl: string }[]) => {
        this.fileDownloadUrls = {};
        data.forEach(file => {
          this.fileDownloadUrls[file.name] = file.downloadUrl;
        });
        this.addLog(`Loaded download URLs for ${data.length} files`);
      })
      .catch(error => {
        this.addLog(`Error loading file URLs: ${error.message}`, true);
      });
  }

  getFileDownloadUrl(fileName: string): string {
    return this.fileDownloadUrls[fileName] || '#';
  }

  navigateToFolder(folder: string) {
    this.currentPath = this.currentPath ? `${this.currentPath}/${folder}` : folder;
    this.addLog(`Navigated to folder: ${this.currentPath}`);
    this.loadFolders();
  }

  goBack() {
    if (!this.currentPath) return;
    const parts = this.currentPath.split('/');
    parts.pop();
    this.currentPath = parts.join('/');
    this.addLog(`Navigated back to: ${this.currentPath || '/'}`);
    this.loadFolders();
  }

  handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.filesToUpload = Array.from(input.files);
      this.addLog(`Selected ${this.filesToUpload.length} files for upload`);
      this.filesToUpload.forEach(file => this.uploadProgress[file.name] = 0);
    } else {
      this.filesToUpload = [];
      this.uploadProgress = {};
      this.addLog('No files selected');
    }
    this.cdr.detectChanges();
  }

  async handleFileUpload() {
    if (this.filesToUpload.length === 0) {
      alert('Please select files to upload.');
      this.addLog('No files selected for upload', true);
      return;
    }

    if (!this.selectedBucket) {
      alert('Please select a bucket.');
      this.addLog('No bucket selected', true);
      return;
    }

    if (!this.userSessionDetails?.username) {
      alert('User email not available. Please log in.');
      this.addLog('User email not available', true);
      return;
    }

    this.loading = true;
    this.result = '';
    this.uploadDetails = [];
    this.addLog(`Starting simultaneous upload of ${this.filesToUpload.length} files to ${this.selectedBucket}/${this.currentPath || ''}`);

    const formData = new FormData();
    this.filesToUpload.forEach(file => formData.append('files', file));
    formData.append('email', this.userSessionDetails.username);
    formData.append('bucketName', this.selectedBucket);
    formData.append('timestamp', new Date().toISOString());
    formData.append('reuploadAfterDays', '7');
    formData.append('sessionId', this.sessionId);
    if (this.currentPath) {
      formData.append('folderPath', this.currentPath);
    }

    try {
      const response = await fetch('http://localhost:8080/api/s3/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      this.uploadDetails = data.files.map((file: any) => ({
        name: file.name,
        size: file.size,
        uploadTime: file.uploadTime
      }));
      this.result = `Uploaded Files:\n${JSON.stringify(this.uploadDetails, null, 2)}`;
      this.addLog(`Upload successful: ${this.uploadDetails.length} files uploaded`);
      this.loadFolders(); // Refresh folder contents
    } catch (error: any) {
      this.result = `Failed to upload files: ${error.message}`;
      this.addLog(`Upload failed: ${error.message}`, true);
    } finally {
      this.loading = false;
      this.filesToUpload = []; // Clear files after upload attempt
      this.cdr.detectChanges();
    }
  }

  retryUpload(detail: { name: string; uploadTime: string; size: number }) {
    const fileName = detail.name.split('/').pop()!; // Extract file name from path
    const file = this.filesToUpload.find(f => f.name === fileName);
    
    if (!file) {
      this.addLog(`Cannot retry ${fileName}: File not available. Please reselect the file.`, true);
      alert(`Please reselect ${fileName} to retry the upload.`);
      return;
    }

    this.uploadProgress[file.name] = 0;
    const formData = new FormData();
    formData.append('files', file);
    formData.append('email', this.userSessionDetails!.username);
    formData.append('bucketName', this.selectedBucket);
    formData.append('timestamp', new Date().toISOString());
    formData.append('reuploadAfterDays', '7');
    formData.append('sessionId', this.sessionId);
    if (this.currentPath) {
      formData.append('folderPath', this.currentPath);
    }

    this.addLog(`Retrying upload for ${file.name}`);
    fetch('http://localhost:8080/api/s3/upload', {
      method: 'POST',
      body: formData
    })
      .then(response => {
        if (!response.ok) throw new Error('Retry failed');
        return response.json();
      })
      .then(data => {
        const fileDetail = data.files[0];
        const index = this.uploadDetails.findIndex(d => d.name === detail.name);
        if (index !== -1) {
          this.uploadDetails[index] = {
            name: fileDetail.name,
            size: fileDetail.size,
            uploadTime: fileDetail.uploadTime
          };
          this.addLog(`Retry successful for ${fileDetail.name}`);
        }
        this.result = `Retry successful:\n${JSON.stringify(this.uploadDetails, null, 2)}`;
        this.loadFolders();
      })
      .catch(error => {
        this.addLog(`Retry failed for ${file.name}: ${error.message}`, true);
        this.result = `Retry failed for ${file.name}: ${error.message}`;
      })
      .finally(() => {
        this.cdr.detectChanges();
      });
  }
}