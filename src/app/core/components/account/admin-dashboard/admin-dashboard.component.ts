import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { S3Service } from 'src/app/services/S3Service'; // Adjust path if needed
import { AuthService } from 'src/app/services/auth.service'; // Adjust path if needed
import { userSessionDetails } from 'src/app/models/user-session-responce.model'; // Adjust path if needed
import * as bootstrap from 'bootstrap';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  adminSessionDetails: userSessionDetails | null | undefined;
  buckets: any[] = [];
  contents: any[] = [];
  selectedBucket: any = null;
  loading: boolean = false;
  errorMessage: string = '';
  bucketSubscription?: Subscription;
  contentSubscription?: Subscription;

  constructor(private s3Service: S3Service, private authService: AuthService) {}

  ngOnInit(): void {
    this.adminSessionDetails = this.authService.getLoggedInUserDetails(); // Adjust method name if different
    this.loadBuckets();
  }

  loadBuckets(): void {
    this.loading = true;
    this.errorMessage = '';
    this.buckets = [];

    this.bucketSubscription = this.s3Service.getS3Buckets().subscribe({
      next: (buckets) => {
        this.buckets = buckets;
        this.loading = false;
        console.log('Admin buckets loaded:', this.buckets);
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.message || 'Failed to load S3 buckets.';
        console.error('Error loading buckets:', err);
        this.buckets = [];
      }
    });
  }

  listBucketContents(bucket: any): void {
    this.selectedBucket = bucket;
    this.loadContents(bucket.name, '');
  }

  listFolderContents(item: any): void {
    this.loadContents(this.selectedBucket.name, item.name);
  }

  private loadContents(bucketName: string, prefix: string): void {
    this.loading = true;
    this.errorMessage = '';
    this.contents = [];

    this.contentSubscription = this.s3Service.getBucketContents(bucketName).subscribe({
      next: (contents) => {
        this.contents = contents;
        this.loading = false;
        console.log('Bucket contents loaded:', this.contents);
        const modalElement = document.getElementById('bucketContentsModal');
        if (modalElement) {
          const modal = new bootstrap.Modal(modalElement);
          modal.show();
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.message || 'Failed to list bucket contents.';
        console.error('Error listing contents:', err);
        this.contents = [];
      }
    });
  }

  viewFile(downloadUrl: string): void {
    window.open(downloadUrl, '_blank');
  }

  formatSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  calculateUsage(size: number): string {
    const totalBytes = 1024 * 1024 * 1024 * 1024; // 1TB
    const percentage = (size / totalBytes) * 100;
    return `${this.formatSize(size)} (${percentage.toFixed(2)}%)`;
  }

  ngOnDestroy(): void {
    this.bucketSubscription?.unsubscribe();
    this.contentSubscription?.unsubscribe();
  }
}