import { Component, OnInit } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';

@Component({
  selector: 'app-upload',
  templateUrl: './upload.component.html',
  styleUrls: ['./upload.component.css']
})
export class UploadComponent implements OnInit {
  userEmail: string = '';
  folderName: string = '';
  selectedFile: File | null = null;
  uploading: boolean = false;
  progress: number = 0;
  message: string = '';
  isSuccess: boolean = false;
  userSessionDetails: { username: string } | null = null; // Added for navbar username display

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // Simulate fetching user session details (e.g., from a service or local storage)
    this.loadUserSession();
  }

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
    this.message = '';
  }

  onUpload() {
    if (!this.userEmail || !this.folderName || !this.selectedFile) {
      this.message = 'Please fill all fields and select a file';
      this.isSuccess = false;
      return;
    }

    const formData = new FormData();
    formData.append('email', this.userEmail);
    formData.append('folderName', this.folderName);
    formData.append('file', this.selectedFile);

    const fileName = encodeURIComponent(this.selectedFile.name);
    const url = `http://localhost:8080/onedrive/upload/${fileName}`;

    this.uploading = true;
    this.progress = 0;
    this.message = '';

    this.http.put(url, formData, {
      reportProgress: true,
      observe: 'events'
    }).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress) {
          this.progress = Math.round(100 * event.loaded / event.total);
        } else if (event.type === HttpEventType.Response) {
          this.handleSuccess(event.body);
        }
      },
      error: (err) => {
        this.handleError(err);
      }
    });
  }

  private handleSuccess(response: any) {
    this.uploading = false;
    this.isSuccess = true;
    this.message = 'File uploaded successfully to OneDrive!';
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
    } else {
      this.message = error.error?.message || 'Upload failed. Please try again.';
    }

    console.error('Upload error:', error);
  }

  private resetForm() {
    this.userEmail = '';
    this.folderName = '';
    this.selectedFile = null;
    this.progress = 0;
    setTimeout(() => {
      this.message = '';
    }, 5000);
  }

  // New method to load user session details (example implementation)
  private loadUserSession() {
    // This could be replaced with an actual service call or authentication logic
    const storedUser = localStorage.getItem('userSession'); // Example: fetching from local storage
    if (storedUser) {
      this.userSessionDetails = JSON.parse(storedUser);
    } else {
      // Mock data for demonstration; replace with real logic
      this.userSessionDetails = { username: 'JohnDoe' };
    }
  }
}