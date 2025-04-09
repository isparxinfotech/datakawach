import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class OneDriveService {
  private apiUrl = 'https://datakavach.com/onedrive'; // Adjust to your backend URL

  constructor(private http: HttpClient) {}

  getRootFolders(username: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/folders?email=${username}`);
  }
}