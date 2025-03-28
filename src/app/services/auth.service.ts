import { Injectable } from '@angular/core';
import { RegisterUserRequest } from '../models/register-user-request.model';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http'
import { LoginUserRequest } from '../models/login-request.model';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { GetPersonalInfoRequest, PersonalInfoRequest } from '../models/personal-info-request.model';
import { resourcePermission } from '../models/api-resp.model';
import { userSessionDetails } from '../models/user-session-responce.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private resourcesAccess: resourcePermission[] = [];
  constructor(private http: HttpClient,private router: Router) { }

  registerUser(model: RegisterUserRequest): Observable<void>{
    return this.http.post<void>(`http://localhost:8080/api/auth/createUser`,model)
  }
  loginUser(model: LoginUserRequest): Observable<void>{
    return this.http.post<void>(`http://localhost:8080/api/auth/signin`,model)
  }
  getPersonalInfo(model: userSessionDetails | null | undefined): Observable<GetPersonalInfoRequest>{
    return this.http.post<GetPersonalInfoRequest>(`http://localhost:8080/api/iauth/getUserRegistrationInformation`,model)
  }
  SavePersonalInfo(model: PersonalInfoRequest): Observable<void>{
    return this.http.post<any>(`http://localhost:8080/api/iauth/updateUserRegistrationInformation`,model)
  }
  logout(): void {
    sessionStorage.clear();
    this.router.navigate(['login']);
  }
  isAuthenticated(): boolean {
    if (this.getLoggedInUserDetails() != null)
    {
      return true;
      }
    return false;
  }

  getResourcesAccess() {
    const jsonObj = sessionStorage.getItem("ResourcesAccess");
    let jsonObj1 =  jsonObj ? JSON.parse(jsonObj) : null;
    this.resourcesAccess = Object.assign(this.resourcesAccess, jsonObj1);
    console.log("Resource List");
    console.log(this.resourcesAccess);
    return this.resourcesAccess;
  }

  getClientIp(): Observable<{ ip: string }> {
    return this.http.get<{ ip: string }>('https://api.ipify.org?format=json');
  }
getLoggedInUserDetails(): userSessionDetails | null {
  const jsonObj = sessionStorage.getItem("UserDetails");
  if (jsonObj) {
    const parsedObj = JSON.parse(jsonObj);
    const userDetails: userSessionDetails = {
      roleid: parsedObj.roleid,
      username: parsedObj.username,
      jwtToken: parsedObj.jwtToken,
      userType: parsedObj.userType,
      cloudProvider:parsedObj.cloudProvider
    };
    
    console.log("User Session Details");
    console.log(userDetails);
    return userDetails;
  } else {
    return null;
  }
}
}
