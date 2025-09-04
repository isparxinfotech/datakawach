import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NgForm } from '@angular/forms';

@Component({
  selector: 'app-shared-content',
  templateUrl: './shared-content.component.html',
  styleUrls: ['./shared-content.component.css']
})
export class SharedContentComponent implements OnInit {
  private baseUrl = 'https://datakavach.com/isparxcloud'; // Replace with https://api.datakavach.com/isparxcloud in production
  token: string | null = null;
  contents: any[] = [];
  filteredContents: any[] = [];
  loading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isFolder = false;
  itemName: string | null = null;
  nextLink: string | null = null;
  searchQuery = '';
  previewToastMessage: string | null = null;
  currentPath: string[] = []; // Track the current folder path for navigation
  breadcrumbItems: { name: string, path: string[] }[] = []; // For breadcrumb navigation

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (this.token) {
      this.fetchSharedContent();
    } else {
      this.errorMessage = 'No token provided in the URL';
    }
  }

  fetchSharedContent(nextLink: string | null = null, path: string[] = []): void {
    this.loading = true;
    let url = nextLink 
      ? `${this.baseUrl}/shared/folder-contents?token=${encodeURIComponent(this.token!)}&nextLink=${encodeURIComponent(nextLink)}`
      : `${this.baseUrl}/shared/folder-contents?token=${encodeURIComponent(this.token!)}`;
    
    if (path.length > 0) {
      const pathStr = path.join('/');
      url += `&path=${encodeURIComponent(pathStr)}`;
    }

    this.http.get<any>(url).subscribe({
      next: (response) => {
        if (response.error) {
          this.errorMessage = response.error;
          this.loading = false;
          return;
        }
        this.isFolder = true;
        this.contents = nextLink ? [...this.contents, ...response.contents] : response.contents;
        this.nextLink = response.nextLink || null;
        this.currentPath = path;
        this.updateBreadcrumb();
        this.itemName = this.currentPath.length > 0 
          ? this.currentPath[this.currentPath.length - 1] 
          : (this.contents.length > 0 ? this.contents[0].name.split('/').pop() : 'Shared Content');
        this.filterContents();
        this.loading = false;
      },
      error: (err) => {
        if (err.status === 400 && err.error.error === 'Token is for a file, not a folder') {
          this.fetchFileDetails();
        } else {
          this.errorMessage = 'Failed to load shared content. The link may be invalid or expired.';
          this.loading = false;
        }
      }
    });
  }

  fetchFileDetails(): void {
    this.loading = true;
    const url = `${this.baseUrl}/shared/file-details?token=${encodeURIComponent(this.token!)}`;
    this.http.get<any>(url).subscribe({
      next: (response) => {
        if (response.error) {
          this.errorMessage = response.error;
          this.loading = false;
          return;
        }
        this.isFolder = false;
        this.contents = [response];
        this.filteredContents = [response];
        this.itemName = response.name;
        this.currentPath = [];
        this.updateBreadcrumb();
        this.loading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load shared file details. The link may be invalid or expired.';
        this.loading = false;
      }
    });
  }

  navigateToFolder(item: any): void {
    if (item.type === 'folder' && this.token) {
      const newPath = [...this.currentPath, item.name];
      this.contents = []; // Clear contents for new folder
      this.nextLink = null; // Reset pagination
      this.fetchSharedContent(null, newPath);
    }
  }

  navigateToBreadcrumb(index: number): void {
    const newPath = this.currentPath.slice(0, index + 1);
    this.contents = [];
    this.nextLink = null;
    this.fetchSharedContent(null, newPath);
  }

  updateBreadcrumb(): void {
    this.breadcrumbItems = [];
    let pathSoFar: string[] = [];
    if (this.isFolder) {
      this.breadcrumbItems.push({ name: 'Shared Content', path: [] });
      this.currentPath.forEach((segment, index) => {
        pathSoFar = [...pathSoFar, segment];
        this.breadcrumbItems.push({ name: segment, path: [...pathSoFar] });
      });
    }
  }

  downloadFolder(path: string[] = []): void {
    if (!this.token) return;
    let url = `${this.baseUrl}/shared/download?token=${encodeURIComponent(this.token)}`;
    if (path.length > 0) {
      const pathStr = path.join('/');
      url += `&path=${encodeURIComponent(pathStr)}`;
    }
    window.location.href = url;
    this.successMessage = `Download started for the shared ${path.length > 0 ? 'subfolder' : 'folder'}.`;
    setTimeout(() => this.successMessage = null, 3000);
  }

  downloadSubFolder(item: any): void {
    if (item.type === 'folder' && this.token) {
      const subFolderPath = [...this.currentPath, item.name];
      this.downloadFolder(subFolderPath);
    }
  }

  filterContents(): void {
    if (!this.searchQuery.trim()) {
      this.filteredContents = [...this.contents];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredContents = this.contents.filter(item =>
        item.name.toLowerCase().includes(query)
      );
    }
  }

  loadMoreContents(): void {
    if (this.nextLink) {
      this.fetchSharedContent(this.nextLink, this.currentPath);
    }
  }

  onThumbnailHover(item: any): void {
    if (this.isImage(item)) {
      this.previewToastMessage = `Previewing thumbnail for ${item.name}`;
    } else if (this.isVideo(item)) {
      this.previewToastMessage = `Previewing video for ${item.name}`;
    }
  }

  onThumbnailLeave(item: any): void {
    this.previewToastMessage = null;
  }

  isImage(item: any): boolean {
    const extension = item.name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp'].includes(extension);
  }

  isVideo(item: any): boolean {
    const extension = item.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'mov', 'wmv', 'avi'].includes(extension);
  }

  formatSize(size: number): string {
    if (size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}