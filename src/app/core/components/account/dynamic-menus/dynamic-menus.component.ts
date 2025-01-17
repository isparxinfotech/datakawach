import { Component, OnInit } from '@angular/core';
import { resourcePermission } from 'src/app/models/api-resp.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-dynamic-menus',
  templateUrl: './dynamic-menus.component.html',
  styleUrls: ['./dynamic-menus.component.css']
})
export class DynamicMenusComponent implements OnInit {
  userSessionDetails: { username: string } | null = null;
  resourceNames: resourcePermission[] = [];
  selectedOption = '';
  username = '';
  files: File[] = [];
  result = '';
  loading = false;
  uploadProgress = 0;
  uploadDetails: { name: string; time: number; size: number }[] = [];
  bucketFiles: any[] = [];
  timestamp: string = new Date().toISOString();
  scheduledTime: string | null = null;
  step: string = '';
  daysOfWeek = [
    { name: 'Monday', selected: false },
    { name: 'Tuesday', selected: false },
    { name: 'Wednesday', selected: false },
    { name: 'Thursday', selected: false },
    { name: 'Friday', selected: false },
    { name: 'Saturday', selected: false },
    { name: 'Sunday', selected: false }
  ];
  frequency: string = '';
sidebarOpen: any;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.loadUserSessionDetails();
    this.initializeScheduledUpload();
  }

  loadUserSessionDetails(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.resourceNames = this.authService.getResourcesAccess();
    console.log('Resource Names:', this.resourceNames);
  }

  selectOption(option: string): void {
    this.selectedOption = option;
    if (option === 'homeScreen') {
      this.fetchFiles();
    }
  }

  fetchFiles(): void {
    if (!this.isUsernameValid()) return;

    this.loading = true;
    this.bucketFiles = [];

    this.apiRequest(
      `http://localhost:8080/api/s3/list?username=${this.username}`,
      'GET',
      null,
      (data: any[]) => {
        this.bucketFiles = data?.length ? data : [];
        if (!data?.length) alert('No files found.');
        console.log('Fetched files:', this.bucketFiles);
      },
      'Failed to fetch files. Please try again later.'
    );
  }

  handleConnect(): void {
    if (!this.isUsernameValid()) return;

    this.loading = true;
    this.result = '';

    this.apiRequest(
      `http://localhost:8080/api/s3/connect?username=${this.username}`,
      'GET',
      null,
      (data) => {
        this.result = JSON.stringify(data, null, 2);
        alert('Connected successfully!');
      },
      'Failed to connect. Please check your connection and try again.'
    );
  }

  handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input?.files) this.files = Array.from(input.files);
  }

  handleFileUpload(): void {
    if (this.files.length === 0 || !this.isUsernameValid()) return;

    this.loading = true;
    this.uploadProgress = 0;
    this.uploadDetails = [];
    const formData = new FormData();

    this.files.forEach((file) => formData.append('files', file));
    formData.append('username', this.username);
    formData.append('timestamp', this.timestamp);

    this.apiRequest(
      `http://localhost:8080/api/s3/upload?username=${this.username}`,
      'POST',
      formData,
      (data) => {
        this.uploadDetails = data.uploadDetails;
        console.log('Uploaded file details:', this.uploadDetails);
      },
      'File upload failed. Please try again later.'
    );
  }

  handleDownload(file: { name: string; url: string }): void {
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    a.click();
  }

  handleDelete(file: { name: string }): void {
    if (confirm(`Are you sure you want to delete the file "${file.name}"?`)) {
      this.loading = true;

      this.apiRequest(
        `http://localhost:8080/api/s3/delete?username=${this.username}&filename=${file.name}`,
        'DELETE',
        null,
        () => {
          alert('File deleted successfully.');
          this.fetchFiles();
        },
        'Failed to delete file. Please try again later.'
      );
    }
  }

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }
  
  logout(): void {
    this.authService.logout();
    alert('Logged out successfully.');
    window.location.href = '/login';
  }

  isUsernameValid(): boolean {
    if (!this.username.trim()) {
      alert('Please enter a username.');
      return false;
    }
    return true;
  }

  private apiRequest(
    url: string,
    method: string,
    body: any,
    onSuccess: (data: any) => void,
    errorMessage: string
  ): void {
    fetch(url, { method, body })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            `Error ${response.status}: ${errorData.message || 'Unknown error'}`
          );
        }
        return response.json();
      })
      .then(onSuccess)
      .catch((error) => {
        console.error('API Error:', error.message);
        alert(`${errorMessage} Details: ${error.message}`);
      })
      .finally(() => {
        this.loading = false;
      });
  }

  initializeScheduledUpload(): void {
    setInterval(() => {
      console.log('Scheduled upload triggered');
      if (this.files.length) this.handleFileUpload();
    }, 300000);
  }

  scheduleFileUpload(): void {
    if (this.scheduledTime) {
      const uploadDate = new Date(this.scheduledTime);
      const now = new Date();

      if (uploadDate > now) {
        const delay = uploadDate.getTime() - now.getTime();
        setTimeout(() => {
          if (this.files.length) this.handleFileUpload();
        }, delay);
        alert('File upload scheduled successfully!');
      } else {
        alert('Scheduled time must be in the future.');
      }
    }
  }
}
