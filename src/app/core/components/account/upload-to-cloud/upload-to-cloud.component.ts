import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { Client } from '@stomp/stompjs';
import * as SockJS from 'sockjs-client';

@Component({
  selector: 'app-upload-to-cloud',
  templateUrl: './upload-to-cloud.component.html',
  styleUrls: ['./upload-to-cloud.component.css'],
})
export class UploadToCloudComponent implements OnInit, OnDestroy {
  buckets: string[] = [];
  selectedBucket: string = '';
  folders: string[] = [];
  files: string[] = [];
  currentPath: string = ''; // S3 bucket path
  userSessionDetails: userSessionDetails | null = null;
  filesToUpload: File[] = [];
  originalFiles: File[] = []; // Store files for retry
  result: string = '';
  loading: boolean = false;
  uploadProgress: { [key: string]: number } = {};
  uploadDetails: { name: string; uploadTime: string; size: number; status: string }[] = [];
  logs: string[] = [];
  sessionId: string = Math.random().toString(36).substring(2); // Unique session ID
  fileDownloadUrls: { [key: string]: string } = {};
  backupTime: string = ''; // Backup time (HH:mm)
  retentionDays: number = 7; // Retention days, default to 7
  localPath: string = ''; // User-provided local file or folder path
  selectedItems: { name: string; type: 'file' | 'folder'; path: string }[] = [];
  webSocketConnected: boolean = false; // Track WebSocket status

  @ViewChild('logContainer') logContainer!: ElementRef;

  private stompClient: Client;

  constructor(
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {
    this.stompClient = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/ws'),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: (str) => this.addLog(`STOMP Debug: ${str}`),
    });
  }

  ngOnInit() {
    try {
      this.userSessionDetails = this.authService.getLoggedInUserDetails();
      if (this.userSessionDetails && this.userSessionDetails.username) {
        this.addLog('Initializing component with user: ' + this.userSessionDetails.username);
        this.loadBuckets();
        this.setupWebSocket();
      } else {
        this.result = 'User not logged in or email not available.';
        this.addLog('Error: User session details not available', true);
      }
    } catch (error: unknown) { // Use unknown
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.result = `Initialization error: ${errorMessage}`;
      this.addLog(`Initialization error: ${errorMessage}`, true);
      console.error('ngOnInit error:', error);
    }
  }

  ngOnDestroy() {
    try {
      if (this.stompClient && this.stompClient.connected) {
        this.stompClient.deactivate();
        this.addLog('STOMP client deactivated');
        this.webSocketConnected = false;
      }
    } catch (error: unknown) { // Use unknown
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog(`Error during cleanup: ${errorMessage}`, true);
      console.error('ngOnDestroy error:', error);
    }
  }

  setupWebSocket() {
    this.stompClient.onConnect = (frame) => {
      this.webSocketConnected = true;
      this.addLog('WebSocket connected successfully');
      this.stompClient.subscribe(`/topic/progress/${this.sessionId}`, (message) => {
        try {
          const data = JSON.parse(message.body);
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
          this.cdr.detectChanges();
        } catch (error: unknown) { // Use unknown
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.addLog(`Error parsing WebSocket message: ${errorMessage}`, true);
          console.error('WebSocket message error:', error);
        }
      });
    };

    this.stompClient.onStompError = (frame) => {
      this.webSocketConnected = false;
      this.addLog(`STOMP error: ${frame.headers['message']}`, true);
      console.error('STOMP error:', frame);
    };

    this.stompClient.onWebSocketError = (error) => {
      this.webSocketConnected = false;
      this.addLog(`WebSocket error: ${error.message || error}`, true);
      console.error('WebSocket error:', error);
    };

    this.stompClient.onDisconnect = () => {
      this.webSocketConnected = false;
      this.addLog('WebSocket disconnected', true);
    };

    try {
      this.stompClient.activate();
      this.addLog('Attempting to connect to WebSocket...');
    } catch (error: unknown) { // Use unknown
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.addLog(`WebSocket activation error: ${errorMessage}`, true);
      console.error('WebSocket activation error:', error);
    }
  }

  addLog(message: string, isError: boolean = false) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${isError ? 'ERROR: ' : ''}${message}`;
    this.logs.push(logMessage);
    this.cdr.detectChanges();
    setTimeout(() => {
      if (this.logContainer && this.logContainer.nativeElement) {
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
      .then((response) => {
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
      .catch((error: unknown) => { // Use unknown
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.result = `Failed to load buckets: ${errorMessage}`;
        this.addLog(`Error loading buckets: ${errorMessage}`, true);
        console.error('loadBuckets error:', error);
      })
      .finally(() => {
        this.loading = false;
        this.cdr.detectChanges();
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
      .then(async (response) => {
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
      .catch((error: unknown) => { // Use unknown
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.result = errorMessage;
        this.addLog(`Error loading folders: ${errorMessage}`, true);
        console.error('loadFolders error:', error);
      })
      .finally(() => {
        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  loadFileDownloadUrls() {
    if (!this.selectedBucket || !this.userSessionDetails?.username) return;

    const url = `http://localhost:8080/api/s3/files?email=${encodeURIComponent(this.userSessionDetails.username)}&bucketName=${encodeURIComponent(this.selectedBucket)}${this.currentPath ? '&prefix=' + encodeURIComponent(this.currentPath) : ''}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch file URLs');
        return response.json();
      })
      .then((data: { name: string; id: string; downloadUrl: string }[]) => {
        this.fileDownloadUrls = {};
        data.forEach((file) => {
          this.fileDownloadUrls[file.name] = file.downloadUrl;
        });
        this.addLog(`Loaded download URLs for ${data.length} files`);
      })
      .catch((error: unknown) => { // Use unknown
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.addLog(`Error loading file URLs: ${errorMessage}`, true);
        console.error('loadFileDownloadUrls error:', error);
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

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.filesToUpload = [];
    this.originalFiles = [];
    this.selectedItems = [];
    this.uploadProgress = {};

    if (input.files && input.files.length > 0) {
      this.filesToUpload = Array.from(input.files);
      this.originalFiles = Array.from(input.files);

      const folderPaths = new Set<string>();
      this.filesToUpload.forEach((file) => {
        const relativePath = (file as any).webkitRelativePath || file.name;
        const pathParts = relativePath.split('/');
        const fileName = pathParts.pop()!;
        const folderPath = pathParts.join('/');

        if (pathParts.length > 0) {
          if (!folderPaths.has(folderPath)) {
            folderPaths.add(folderPath);
            this.selectedItems.push({ name: folderPath, type: 'folder', path: folderPath });
          }
        }

        this.selectedItems.push({ name: fileName, type: 'file', path: relativePath });
        this.uploadProgress[relativePath] = 0;
      });

      this.addLog(`Selected ${this.filesToUpload.length} files across ${folderPaths.size} folders`);
    } else {
      this.addLog('No files or folders selected', true);
    }
    this.cdr.detectChanges();
  }

  validateLocalPath(path: string): boolean {
    const pathPattern = /^(\/|[a-zA-Z]:\\)[\w\-\\\/]+$/;
    return pathPattern.test(path);
  }

  validateBackupTime(time: string): boolean {
    const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timePattern.test(time);
  }

  async handleFileUpload() {
    if (this.filesToUpload.length === 0) {
      alert('Please select files or folders to upload.');
      this.addLog('No files selected for upload', true);
      return;
    }

    if (!this.selectedBucket) {
      alert('Please select a bucket.');
      this.addLog('No bucket selected', true);
      return;
    }

    if (!this.backupTime || !this.validateBackupTime(this.backupTime)) {
      alert('Please enter a valid backup time in HH:mm format (e.g., 14:30).');
      this.addLog('Invalid or missing backup time: ' + this.backupTime, true);
      return;
    }

    if (!this.retentionDays || this.retentionDays < 1) {
      alert('Please enter a valid retention period (minimum 1 day).');
      this.addLog('Invalid retention days: ' + this.retentionDays, true);
      return;
    }

    if (!this.localPath || !this.validateLocalPath(this.localPath)) {
      alert('Please enter a valid local file or folder path (e.g., /path/to/file or C:\\path\\to\\file).');
      this.addLog('Invalid or missing local path: ' + this.localPath, true);
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
    this.addLog(`Starting upload to ${this.selectedBucket}/${this.currentPath || ''}`);

    const formData = new FormData();
    this.filesToUpload.forEach((file) => formData.append('files', file));
    formData.append('email', this.userSessionDetails.username);
    formData.append('bucketName', this.selectedBucket);
    formData.append('timestamp', new Date().toISOString());
    formData.append('reuploadAfterDays', this.retentionDays.toString());
    formData.append('sessionId', this.sessionId);
    formData.append('backupTime', this.backupTime);
    formData.append('localFilePath', this.localPath);
    if (this.currentPath) formData.append('folderPath', this.currentPath);

    try {
      const response = await fetch('http://localhost:8080/api/s3/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (data.success) {
        this.uploadDetails = data.processedFiles.map((file: any) => ({
          name: file.fileName,
          size: file.size,
          uploadTime: file.uploadTime,
          status: file.status,
        }));
        const uploadedCount = this.uploadDetails.filter((d) => d.status === 'uploaded').length;
        const skippedCount = this.uploadDetails.filter((d) => d.status === 'skipped').length;
        const failedCount = this.uploadDetails.filter((d) => d.status === 'failed').length;
        this.result = `Processed ${this.uploadDetails.length} files:\n- Uploaded: ${uploadedCount}\n- Skipped: ${skippedCount}\n- Failed: ${failedCount}`;
        this.addLog(`Upload complete: ${uploadedCount} uploaded, ${skippedCount} skipped, ${failedCount} failed`);
      } else {
        this.result = `Upload failed: ${data.message}`;
        this.addLog(`Upload failed: ${data.message}`, true);
      }
      this.loadFolders();
    } catch (error: unknown) { // Use unknown
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.result = `Failed to upload files: ${errorMessage}`;
      this.addLog(`Upload error: ${errorMessage}`, true);
      console.error('Upload error:', error);
    } finally {
      this.loading = false;
      this.filesToUpload = [];
      this.selectedItems = [];
      this.cdr.detectChanges();
    }
  }

  async retryUpload(detail: { name: string; uploadTime: string; size: number; status: string }) {
    if (detail.status !== 'failed') {
      alert('Retry is only available for failed uploads.');
      this.addLog(`Cannot retry ${detail.name}: Status is ${detail.status}`, true);
      return;
    }

    const filePath = detail.name;
    const file = this.originalFiles.find((f) => (f as any).webkitRelativePath === filePath || f.name === filePath);
    if (!file) {
      alert(`Please reselect ${filePath} to retry the upload.`);
      this.addLog(`Cannot retry ${filePath}: File not available`, true);
      return;
    }

    if (!this.backupTime || !this.validateBackupTime(this.backupTime)) {
      alert('Please enter a valid backup time in HH:mm format (e.g., 14:30).');
      this.addLog('Invalid or missing backup time for retry: ' + this.backupTime, true);
      return;
    }

    if (!this.retentionDays || this.retentionDays < 1) {
      alert('Please enter a valid retention period (minimum 1 day).');
      this.addLog('Invalid retention days for retry: ' + this.retentionDays, true);
      return;
    }

    if (!this.localPath || !this.validateLocalPath(this.localPath)) {
      alert('Please enter a valid local file or folder path (e.g., /path/to/file or C:\\path\\to\\file).');
      this.addLog('Invalid or missing local path for retry: ' + this.localPath, true);
      return;
    }

    const relativePath = (file as any).webkitRelativePath || file.name;
    this.uploadProgress[relativePath] = 0;
    const formData = new FormData();
    formData.append('files', file);
    formData.append('email', this.userSessionDetails!.username);
    formData.append('bucketName', this.selectedBucket);
    formData.append('timestamp', new Date().toISOString());
    formData.append('reuploadAfterDays', this.retentionDays.toString());
    formData.append('sessionId', this.sessionId);
    formData.append('backupTime', this.backupTime);
    formData.append('localFilePath', this.localPath);
    if (this.currentPath) formData.append('folderPath', this.currentPath);

    this.addLog(`Retrying upload for ${relativePath}`);
    try {
      const response = await fetch('http://localhost:8080/api/s3/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Retry failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      if (data.success) {
        const fileDetail = data.processedFiles[0];
        const index = this.uploadDetails.findIndex((d) => d.name === detail.name);
        if (index !== -1) {
          this.uploadDetails[index] = {
            name: fileDetail.fileName,
            size: fileDetail.size,
            uploadTime: fileDetail.uploadTime,
            status: fileDetail.status,
          };
          this.addLog(`Retry successful for ${fileDetail.fileName}`);
        }
        this.result = `Retry successful for ${fileDetail.fileName}`;
        this.loadFolders();
      } else {
        this.result = `Retry failed: ${data.message}`;
        this.addLog(`Retry failed: ${data.message}`, true);
      }
    } catch (error: unknown) { // Use unknown
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.result = `Retry failed: ${errorMessage}`;
      this.addLog(`Retry error: ${errorMessage}`, true);
      console.error('Retry error:', error);
    } finally {
      this.cdr.detectChanges();
    }
  }
}