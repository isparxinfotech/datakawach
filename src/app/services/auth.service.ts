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
  private apiUrl = 'https://datakavach.com/api/auth'; // Hardcoded URL as per your request

  constructor(private http: HttpClient, private router: Router) {}

  // Register a new user
  registerUser(model: RegisterUserRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/createUser`, model);
  }

  // Login user
  loginUser(model: LoginUserRequest): Observable<userSessionDetails> {
    return this.http.post<userSessionDetails>(`${this.apiUrl}/signin`, model);
  }

  // Request OTP (updated to call /signin and return userSessionDetails)
  requestOtp(username: string, password: string): Observable<userSessionDetails> {
    return this.http.post<userSessionDetails>(`${this.apiUrl}/signin`, { username, password });
  }

  // Validate OTP for login (updated to match backend /validateMfaCode)
  validateOtp(username: string, otp: string, currentPassword: string): Observable<userSessionDetails> {
    return this.http.post<userSessionDetails>(`${this.apiUrl}/validateMfaCode`, {
      email: username,
      mfaCode: otp
    });
  }

  // Forgot password
  forgotPassword(email: string): Observable<{ statusCode: string, message: string }> {
    const body = { email };
    return this.http.post<{ statusCode: string, message: string }>(`${this.apiUrl}/forgotPassword`, body);
  }

  // Validate OTP for password reset
  validateOtpForPasswordReset(email: string, otp: string): Observable<{ statusCode: string, message: string }> {
    const body = { email, otp };
    return this.http.post<{ statusCode: string, message: string }>(`${this.apiUrl}/validateOtpForPasswordReset`, body);
  }

  // Reset password
  resetPassword(model: { email: string; newPassword: string }): Observable<{ statusCode: string, message: string }> {
    return this.http.post<{ statusCode: string, message: string }>(`${this.apiUrl}/resetPassword`, model);
  }

  // Get personal info
  getPersonalInfo(model: userSessionDetails | null | undefined): Observable<GetPersonalInfoRequest> {
    return this.http.post<GetPersonalInfoRequest>(`${this.apiUrl}/getUserRegistrationInformation`, model);
  }

  // Save personal info
  savePersonalInfo(model: PersonalInfoRequest): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/updateUserRegistrationInformation`, model);
  }

  validateMfaCode(email: string, mfaCode: string): Observable<userSessionDetails> {
    console.log('Validating MFA code for:', email, 'with code:', mfaCode);
    return this.http.post<userSessionDetails>(`${this.apiUrl}/validateMfaCode`, { email, mfaCode });
  }

  // Logout user
  logout(): void {
    sessionStorage.clear();
    this.router.navigate(['login']);
  }

  // Upload users Excel
  uploadUsersExcel(formData: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/uploadUsers`, formData);
  }

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return this.getLoggedInUserDetails() !== null;
  }

  // Get resources access from session storage
  getResourcesAccess(): resourcePermission[] {
    const jsonObj = sessionStorage.getItem('ResourcesAccess');
    const jsonObj1 = jsonObj ? JSON.parse(jsonObj) : null;
    this.resourcesAccess = Object.assign(this.resourcesAccess, jsonObj1);
    console.log('Resource List');
    console.log(this.resourcesAccess);
    return this.resourcesAccess;
  }

  // Get client IP
  getClientIp(): Observable<{ ip: string }> {   
    return this.http.get<{ ip: string }>('https://api.ipify.org?format=json');
  }

  // Get logged-in user details from session storage
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
        message: parsedObj.message || '',
        retentionNeeded: parsedObj.retentionNeeded ?? 0,
        qrCodeUrl: parsedObj.qrCodeUrl || '' // Added for MFA
      };
      console.log('User Session Details');
      console.log(userDetails);
      return userDetails;
    }
    return null;
  }

  // Save user details to session storage
  saveUserDetails(userDetails: userSessionDetails): void {
    const completeDetails: userSessionDetails = {
      ...userDetails,
      statusCode: userDetails.statusCode || '200',
      message: userDetails.message || '',
      resourcePermission: userDetails.resourcePermission || [],
      cloudProvider: userDetails.cloudProvider || '',
      retentionNeeded: userDetails.retentionNeeded ?? 0,
      qrCodeUrl: userDetails.qrCodeUrl || '' // Added for MFA
    };
    sessionStorage.setItem('UserDetails', JSON.stringify(completeDetails));
    if (userDetails.resourcePermission) {
      sessionStorage.setItem('ResourcesAccess', JSON.stringify(userDetails.resourcePermission));
    }
  }
}