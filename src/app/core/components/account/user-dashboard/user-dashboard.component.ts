import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';

@Component({
  selector: 'app-user-dashboard',
  templateUrl: './user-dashboard.component.html',
  styleUrls: ['./user-dashboard.component.css']
})
export class UserDashboardComponent implements OnInit {
  userSessionDetails: userSessionDetails | null | undefined;
  email: string = '';
  folderName: string = '';
  files: { name: string, id: string, downloadUrl: string }[] = [];
  loading: boolean = false;
  errorMessage: string = '';

  constructor(private authService: AuthService, private http: HttpClient) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    // Optionally pre-fill email from session if available
    if (this.userSessionDetails?.username) {
      this.email = this.userSessionDetails.username;
    }
  }

  listFiles(): void {
    if (!this.email || !this.folderName) {
      this.errorMessage = 'Please provide both email and folder name.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.files = [];

    const url = `http://localhost:8080/onedrive/files?email=${encodeURIComponent(this.email)}&folderName=${encodeURIComponent(this.folderName)}`;
    this.http.get<any[]>(url).subscribe({
      next: (response) => {
        this.files = response;
        this.loading = false;
        if (this.files.length === 0) {
          this.errorMessage = 'No files found in the specified folder.';
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to list files. Please try again.';
        console.error('Error listing files:', err);
      }
    });
  }

  viewFile(downloadUrl: string): void {
    // Open file in a new tab for viewing
    window.open(downloadUrl, '_blank');
  }
}