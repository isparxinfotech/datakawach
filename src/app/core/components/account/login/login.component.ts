import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { AlertService } from 'src/app/services/alert.servive';
import { userSessionDetails } from 'src/app/models/api-resp.model';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnDestroy {
  frmValidate: FormGroup;
  otpForm: FormGroup;
  showOtp = false;
  submitted = false;
  otpSubmitted = false;
  invalidMsg = '';
  currentUsername = '';
  currentPassword = ''; // Store password for OTP validation
  private subscriptions: Subscription[] = [];
  timer: number = 60; // 1-minute timer in seconds
  timerDisplay: string = '1:00'; // Display as M:SS
  timerRunning: boolean = false;
  timerSubscription: Subscription | null = null;

  constructor(
    private authService: AuthService,
    private alertService: AlertService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.frmValidate = this.fb.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });

    this.otpForm = this.fb.group({
      otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
    });
  }

  onLoginUser() {
    this.submitted = true;
    this.invalidMsg = '';

    if (this.frmValidate.invalid) {
      this.alertService.showAlert('info', 'Please enter valid credentials');
      return;
    }

    const credentials = {
      username: this.frmValidate.value.username,
      password: this.frmValidate.value.password
    };

    const sub = this.authService.loginUser(credentials).subscribe({
      next: (response: userSessionDetails) => {
        if (response.statusCode === '202') {
          // OTP required
          this.currentUsername = credentials.username;
          this.currentPassword = credentials.password; // Store password
          this.showOtp = true;
          this.requestOtp(credentials.username, credentials.password);
        } else if (response.statusCode === '200') {
          // Regular login successful
          this.handleSuccessfulLogin(response);
        } else {
          this.invalidMsg = response.message || 'Login failed';
          this.alertService.showAlert('error', this.invalidMsg);
        }
      },
      error: (error) => {
        this.invalidMsg = error.error?.message || 'Login failed';
        this.alertService.showAlert('error', this.invalidMsg);
      }
    });
    this.subscriptions.push(sub);
  }

  onValidateOtp() {
    this.otpSubmitted = true;
    if (this.otpForm.invalid) {
      this.alertService.showAlert('info', 'Please enter a valid 6-digit OTP');
      return;
    }

    const sub = this.authService.validateOtp(
      this.currentUsername,
      this.otpForm.value.otp,
      this.currentPassword // Pass stored password
    ).subscribe({
      next: (response: userSessionDetails) => {
        if (response.statusCode === '200') {
          // OTP validation and login successful
          this.stopTimer();
          this.handleSuccessfulLogin(response);
        } else {
          this.invalidMsg = response.message || 'OTP validation failed';
          this.alertService.showAlert('error', this.invalidMsg);
        }
      },
      error: (error) => {
        this.invalidMsg = error.error?.message || 'OTP validation failed';
        this.alertService.showAlert('error', this.invalidMsg);
      }
    });
    this.subscriptions.push(sub);
  }

  resendOtp() {
    if (!this.timerRunning) {
      this.requestOtp(this.currentUsername, this.currentPassword);
      this.otpForm.reset();
      this.otpSubmitted = false;
      this.invalidMsg = '';
    }
  }

  private requestOtp(username: string, password: string) {
    const sub = this.authService.requestOtp(username, password).subscribe({
      next: () => {
        this.alertService.showAlert('success', 'OTP sent successfully');
        this.startTimer(); // Start timer when OTP is sent
      },
      error: (error) => {
        this.alertService.showAlert('error', error.error || 'Failed to send OTP');
      }
    });
    this.subscriptions.push(sub);
  }

  private handleSuccessfulLogin(response: userSessionDetails) {
    this.authService.saveUserDetails(response);
    this.router.navigate(['/dashboard']);
  }

  goBackToLogin() {
    this.showOtp = false;
    this.otpSubmitted = false;
    this.otpForm.reset();
    this.currentPassword = ''; // Clear stored password
    this.stopTimer(); // Stop timer when going back to login
  }

  private startTimer() {
    this.timer = 60;
    this.timerRunning = true;
    this.updateTimerDisplay();
    this.stopTimer(); // Ensure any existing timer is stopped
    this.timerSubscription = interval(1000).subscribe(() => {
      this.timer--;
      this.updateTimerDisplay();
      if (this.timer <= 0) {
        this.timerRunning = false; // Allow resend, but keep timer visible
      }
    });
  }

  private stopTimer() {
    if (this.timerSubscription) {
      this.timerSubscription.unsubscribe();
      this.timerSubscription = null;
    }
    this.timerRunning = false;
    this.timer = 0;
    this.timerDisplay = '0:00';
  }

  private updateTimerDisplay() {
    const minutes = Math.floor(this.timer / 60);
    const seconds = this.timer % 60;
    this.timerDisplay = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.stopTimer(); // Clean up timer
  }
}