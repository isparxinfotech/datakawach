import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class S3Service {
  private apiUrl = 'http://localhost:8080/api/AWSs3'; // Base URL for AdminDashboardComponent

  constructor(private http: HttpClient) {}

  getS3Buckets(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/buckets`).pipe(
      map(buckets =>
        buckets.map(bucket => ({
          name: bucket.name || bucket || 'Unknown', // Handle string or object
          region: bucket.region || 'N/A',
          size: bucket.size || 0,
          objectCount: bucket.objectCount || 0,
          creationDate: bucket.creationDate ? new Date(bucket.creationDate) : new Date(),
          lastModified: bucket.lastModified ? new Date(bucket.lastModified) : new Date()
        }))
      ),
      catchError(this.handleError)
    );
  }

  getBucketContents(bucketName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/buckets/${bucketName}/contents`).pipe(
      map(contents =>
        contents.map(item => ({
          name: item.name || 'Unknown',
          type: item.isFolder ? 'folder' : 'file',
          size: item.size || 0,
          lastModified: item.lastModified ? new Date(item.lastModified) : new Date(),
          downloadUrl: item.downloadUrl || null
        }))
      ),
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unknown error occurred!';
    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error: ${error.error.message}`;
    } else {
      errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}