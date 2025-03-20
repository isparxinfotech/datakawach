import { Component, OnInit } from '@angular/core';

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
  userSessionDetails: { username: string } | null = null;
  filesToUpload: File[] = [];
  result = '';
  loading = false;
  uploadProgress = 0;
  uploadDetails: { name: string; uploadTime: string; size: number }[] = [];

  constructor() {
    this.userSessionDetails = { username: 'JohnDoe' }; // Replace with actual service
  }

  ngOnInit() {
    this.loadBuckets();
  }

  loadBuckets() {
    this.loading = true;
    fetch('http://localhost:8080/api/s3/buckets')
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch buckets');
        return response.json();
      })
      .then((data: string[]) => {
        this.buckets = data;
        console.log('Buckets loaded:', this.buckets); // Debug
        if (this.buckets.length > 0) {
          this.selectedBucket = this.buckets[0]; // Default to first bucket
          this.loadFolders();
        }
      })
      .catch(error => {
        this.result = `Failed to load buckets: ${error.message}`;
        console.error('Error loading buckets:', error);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  loadFolders() {
    if (!this.selectedBucket) return;

    this.loading = true;
    const url = `http://localhost:8080/api/s3/folders?bucketName=${encodeURIComponent(this.selectedBucket)}${this.currentPath ? '&prefix=' + encodeURIComponent(this.currentPath) : ''}`;
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
        console.log('Folders:', this.folders, 'Files:', this.files); // Debug
      })
      .catch(error => {
        this.result = error.message;
        console.error('Error loading folders:', error);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  navigateToFolder(folder: string) {
    this.currentPath = this.currentPath ? `${this.currentPath}/${folder}` : folder;
    this.loadFolders();
  }

  goBack() {
    if (!this.currentPath) return;
    const parts = this.currentPath.split('/');
    parts.pop();
    this.currentPath = parts.join('/');
    this.loadFolders();
  }

  handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.filesToUpload = Array.from(input.files);
      console.log('Files selected:', this.filesToUpload); // Debug
    } else {
      this.filesToUpload = [];
      console.log('No files selected'); // Debug
    }
  }

  handleFileUpload() {
    if (this.filesToUpload.length === 0) {
      alert('Please select files to upload.');
      return;
    }

    if (!this.selectedBucket) {
      alert('Please select a bucket.');
      return;
    }

    this.loading = true;
    this.result = '';
    this.uploadProgress = 0;
    this.uploadDetails = [];
    console.log('Starting upload with files:', this.filesToUpload, 'to bucket:', this.selectedBucket, 'path:', this.currentPath); // Debug

    const formData = new FormData();
    this.filesToUpload.forEach((file) => {
      formData.append('files', file);
    });
    formData.append('bucketName', this.selectedBucket);
    formData.append('timestamp', new Date().toISOString());
    formData.append('reuploadAfterDays', '7');
    if (this.currentPath) {
      formData.append('folderPath', this.currentPath);
    }

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:8080/api/s3/upload', true);

    xhr.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) {
        this.uploadProgress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        console.log('Upload progress:', this.uploadProgress + '%'); // Debug
      }
    };

    xhr.onload = async () => {
      this.loading = false;
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        this.uploadDetails = data.files.map((file: any) => ({
          name: file.name,
          size: file.size,
          uploadTime: file.uploadTime
        }));
        this.result = `Uploaded Files:\n${JSON.stringify(data, null, 2)}`;
        console.log('Upload successful:', data); // Debug
        this.loadFolders(); // Refresh folder contents
      } else {
        const errorText = await xhr.responseText;
        this.result = `Failed to upload files: ${xhr.status} - ${errorText}`;
        console.error('Upload failed:', xhr.status, errorText); // Debug
      }
    };

    xhr.onerror = () => {
      this.loading = false;
      this.result = 'Failed to upload files: Network error';
      console.error('Upload network error'); // Debug
    };

    xhr.send(formData);
  }
}