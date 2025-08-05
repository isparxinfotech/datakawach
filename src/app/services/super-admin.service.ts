import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { GetPersonalInfoRequest, PersonalInfoRequest } from '../models/personal-info-request.model';
import { userSessionDetails } from '../models/user-session-responce.model';

@Injectable({
  providedIn: 'root'
})
export class SuperAdminService {
  private apiUrl = 'https://datakavach.com/api/auth';

  constructor(private http: HttpClient) {}

  getUsersList(model: userSessionDetails | null | undefined): Observable<GetPersonalInfoRequest> {
    if (!model || !model.jwtToken) {
      throw new Error('User session details or JWT token missing');
    }
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${model.jwtToken}`
    });
    return this.http.post<GetPersonalInfoRequest>(`${this.apiUrl}/getUserList`, model, { headers });
  }

  updateUser(username: string, user: any): Observable<any> {
    if (!user || !user.jwtToken) {
      throw new Error('User session details or JWT token missing');
    }
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${user.jwtToken}`
    });
    return this.http.put(`${this.apiUrl}/users/${username}`, user, { headers });
  }

  updateIsAuthenticated(email: string, isAuthenticated: number, userSession: userSessionDetails): Observable<any> {
    if (!userSession || !userSession.jwtToken || !userSession.username) {
      throw new Error('User session details, JWT token, or username missing');
    }
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userSession.jwtToken}`
    });
    const body = {
      email,
      isAuthenticated,
      requesterEmail: userSession.username
    };
    return this.http.post(`${this.apiUrl}/updateIsAuthenticated`, body, { headers });
  }
}