import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GcpService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getBackups(email: string, token: string): Observable<{ backups: { name: string, fullPath: string, size: string, created: string, updated: string }[] }> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
    const params = new HttpParams().set('email', email);
    return this.http.get<{ backups: { name: string, fullPath: string, size: string, created: string, updated: string }[] }>(`${this.apiUrl}gcp/request-backup-list`, { headers, params });
  }

  downloadBackup(email: string, fullPath: string, token: string): Observable<Blob> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    // Encode the fullPath to handle spaces and special characters
    const encodedFullPath = encodeURIComponent(fullPath);
    const params = new HttpParams()
      .set('email', email)
      .set('fullPath', encodedFullPath);
    return this.http.get(`${this.apiUrl}gcp/request-file`, {
      headers,
      params,
      responseType: 'blob'
    });
  }
}