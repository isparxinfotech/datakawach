import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class MetricsService {
  private apiUrl = 'https://api.datakavach.com/admin/metrics'; // Replace with actual API endpoint

  constructor(private http: HttpClient) {}

  getDashboardMetrics(): Observable<{ totalCorporates: number; totalUsers: number; totalStorage: number }> {
    return this.http.get<{ totalCorporates: number; totalUsers: number; totalStorage: number }>(this.apiUrl);
  }
}