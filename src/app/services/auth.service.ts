import { Injectable } from '@angular/core';
import { RegisterUserRequest } from '../models/register-user-request.model';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
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
  private apiUrl = 'https://datakavach.com/api/auth';

  constructor(private http: HttpClient, private router: Router) {}

  // Register a new user (unchanged)
  registerUser(model: RegisterUserRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/createUser`, model);
  }

  // Updated loginUser to handle both regular and OTP flows
  loginUser(model: LoginUserRequest): Observable<userSessionDetails> {
    return this.http.post<userSessionDetails>(`${this.apiUrl}/signin`, model);
  }

  // Request OTP (updated to use HttpParams)
  requestOtp(username: string, password: string): Observable<any> {
    const params = new HttpParams()
      .set('username', username)
      .set('password', password);
    return this.http.post(`${this.apiUrl}/requestOtp`, null, {
      params,
      responseType: 'text'
    });
  }

  // Validate OTP (updated to include currentPassword in HttpParams)
  validateOtp(username: string, otp: number, currentPassword: string): Observable<userSessionDetails> {
    const params = new HttpParams()
      .set('username', username)
      .set('otpnum', otp.toString())
      .set('password', currentPassword);
    return this.http.post<userSessionDetails>(`${this.apiUrl}/validateOtp`, null, { params });
  }

  // Get personal info (unchanged)
  getPersonalInfo(model: userSessionDetails | null | undefined): Observable<GetPersonalInfoRequest> {
    return this.http.post<GetPersonalInfoRequest>(`${this.apiUrl}/getUserRegistrationInformation`, model);
  }

  // Save personal info (unchanged)
  savePersonalInfo(model: PersonalInfoRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/updateUserRegistrationInformation`, model);
  }

  // Logout user (unchanged)
  logout(): void {
    sessionStorage.clear();
    this.router.navigate(['login']);
  }

  // Check if user is authenticated (unchanged)
  isAuthenticated(): boolean {
    return this.getLoggedInUserDetails() !== null;
  }

  // Get resources access from session storage (unchanged)
  getResourcesAccess(): resourcePermission[] {
    const jsonObj = sessionStorage.getItem('ResourcesAccess');
    const jsonObj1 = jsonObj ? JSON.parse(jsonObj) : null;
    this.resourcesAccess = Object.assign(this.resourcesAccess, jsonObj1);
    console.log('Resource List');
    console.log(this.resourcesAccess);
    return this.resourcesAccess;
  }

  // Get client IP (unchanged)
  getClientIp(): Observable<{ ip: string }> {
    return this.http.get<{ ip: string }>('https://api.ipify.org?format=json');
  }

  // Get logged-in user details from session storage (updated with proper typing)
  getLoggedInUserDetails(): userSessionDetails | null {
    const jsonObj = sessionStorage.getItem('UserDetails');
    if (jsonObj) {
      const parsedObj = JSON.parse(jsonObj);
      const userDetails: userSessionDetails = {
        roleid: parsedObj.roleid,
        username: parsedObj.username,
        jwtToken: parsedObj.jwtToken,
        userType: parsedObj.userType,
        cloudProvider: parsedObj.cloudProvider || '',
        statusCode: parsedObj.statusCode || '',
        resourcePermission: parsedObj.resourcePermission || [],
        message: parsedObj.message || ''
      };
      console.log('User Session Details');
      console.log(userDetails);
      return userDetails;
    }
    return null;
  }

  // Save user details to session storage (updated with complete fields)
  saveUserDetails(userDetails: userSessionDetails): void {
    const completeDetails: userSessionDetails = {
      ...userDetails,
      statusCode: userDetails.statusCode || '200',
      message: userDetails.message || '',
      resourcePermission: userDetails.resourcePermission || [],
      cloudProvider: userDetails.cloudProvider || ''
    };
    sessionStorage.setItem('UserDetails', JSON.stringify(completeDetails));
    if (userDetails.resourcePermission) {
      sessionStorage.setItem('ResourcesAccess', JSON.stringify(userDetails.resourcePermission));
    }
  }
}