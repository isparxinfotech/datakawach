import { Injectable } from '@angular/core';
import {
  GetPersonalInfoRequest,
  PersonalInfoRequest,
} from '../models/personal-info-request.model';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { userSessionDetails } from '../models/user-session-responce.model';

@Injectable({
  providedIn: 'root',
})
export class SuperAdminService {
  constructor(private http: HttpClient) {}
  getUsersList(
    model: userSessionDetails | null | undefined
  ): Observable<GetPersonalInfoRequest> {
    return this.http.post<GetPersonalInfoRequest>(
      `http://13.203.227.138/api/auth/getUserList`,
      model
    );
  }

  updateUser(username: string, user: any): Observable<any> {
    return this.http.put(
      `http://13.203.227.138/api/auth/users/${username}`,
      user
    );
  }
}
