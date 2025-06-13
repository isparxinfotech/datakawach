import { Component, OnInit, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import * as bootstrap from 'bootstrap';

@Component({
  selector: 'app-google-dashboard',
  templateUrl: './google-dashboard.component.html',
  styleUrls: ['./google-dashboard.component.css']
})
export class GoogleDashboardComponent implements OnInit, OnDestroy {
  userSessionDetails: userSessionDetails | null | undefined;
  backups: { name: string, createdAt: string, size: string, encrypted: string }[] = [];
  backupSubscription?: Subscription;
  errorMessage: string | null = null;
  selectedBackupName: string | null = null;
  encryptionKey: string = '';
  modalErrorMessage: string | null = null;
  private baseUrl = 'https://datakavach.com';
  private encryptionKeyModal: bootstrap.Modal | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (this.userSessionDetails) {
      this.getBackupsList();
    }
    // Initialize modal
    const modalElement = document.getElementById('encryptionKeyModal');
    if (modalElement) {
      this.encryptionKeyModal = new bootstrap.Modal(modalElement);
    }
  }

  getBackupsList(): void {
    this.errorMessage = null;
    if (!this.userSessionDetails?.username) {
      this.errorMessage = 'No user username found';
      console.error(this.errorMessage);
      return;
    }

    const url = `${this.baseUrl}/gcp/backups?username=${encodeURIComponent(this.userSessionDetails.username)}`;
    this.backupSubscription = this.http.get<{ backups: { name: string, createdAt: string, size: string, encrypted: string }[] }>(url)
      .subscribe({
        next: (response) => {
          console.log('Backups fetched:', response);
          this.backups = response.backups;
          if (this.backups.length > 0) {
            this.backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          }
        },
        error: (error) => {
          this.errorMessage = error.error?.error || 'Failed to fetch backups. Please try again.';
          console.error('Error fetching backups:', error);
        }
      });
  }

  refreshBackups(): void {
    this.getBackupsList();
  }

  openEncryptionKeyModal(backupName: string): void {
    this.selectedBackupName = backupName;
    this.encryptionKey = '';
    this.modalErrorMessage = null;
    this.encryptionKeyModal?.show();
  }

  downloadBackup(): void {
    this.modalErrorMessage = null;
    if (!this.userSessionDetails?.username) {
      this.modalErrorMessage = 'No user username found';
      console.error(this.modalErrorMessage);
      return;
    }
    if (!this.selectedBackupName) {
      this.modalErrorMessage = 'No backup selected';
      console.error(this.modalErrorMessage);
      return;
    }

    let url = `${this.baseUrl}/gcp/download?username=${encodeURIComponent(this.userSessionDetails.username)}&backupName=${encodeURIComponent(this.selectedBackupName)}`;
    if (this.encryptionKey) {
      url += `&encryptionKey=${encodeURIComponent(this.encryptionKey)}`;
    }
    const headers = new HttpHeaders().set('Accept', 'application/octet-stream');

    this.http.get(url, { headers, responseType: 'blob' })
      .subscribe({
        next: (blob) => {
          const downloadUrl = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = this.selectedBackupName + '.tar.gz';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(downloadUrl);
          this.encryptionKeyModal?.hide();
        },
        error: (error) => {
          this.modalErrorMessage = error.error?.error || 'Failed to download backup. Please check the encryption key or try again.';
          console.error('Error downloading backup:', error);
        }
      });
  }

  ngOnDestroy(): void {
    this.backupSubscription?.unsubscribe();
    this.encryptionKeyModal?.dispose();
  }
}