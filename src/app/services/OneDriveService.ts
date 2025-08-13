import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class OneDriveService {
  private apiUrl = 'https://datakavach.com/cloud'; // Adjust based on your backend URL

  constructor(private http: HttpClient) {}

  uploadFolder(
    files: File[],
    email: string,
    baseFolderName: string,
    relativePaths: string[]
  ): Observable<{ successMessages: string[]; errorMessages: string[] }> {
    const formData = new FormData();
    
    // Append files
    files.forEach((file, index) => {
      formData.append('files', file, file.name);
    });
    
    // Append other parameters
    formData.append('email', email);
    formData.append('baseFolderName', baseFolderName);
    relativePaths.forEach((path, index) => {
      formData.append(`relativePaths[${index}]`, path);
    });

    return this.http
      .post<{ successMessages: string[]; errorMessages: string[] }>(
        `${this.apiUrl}/upload-folder`,
        formData
      )
      .pipe(
        map(response => ({
          successMessages: response.successMessages || [],
          errorMessages: response.errorMessages || []
        })),
        catchError(this.handleError)
      );
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred while processing the request.';
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = `Client error: ${error.error.message}`;
    } else {
      // Server-side error
      if (error.error && error.error.errorMessages) {
        errorMessage = error.error.errorMessages.join('; ');
      } else if (error.error && error.error.error) {
        errorMessage = error.error.error;
      } else {
        errorMessage = `Server error: ${error.status} - ${error.message}`;
      }
    }
    console.error(errorMessage);
    return throwError(() => new Error(errorMessage));
  }
}