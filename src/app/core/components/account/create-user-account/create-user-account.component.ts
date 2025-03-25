import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RegisterUserRequest } from 'src/app/models/register-user-request.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-user-information',
  templateUrl: './create-user-account.component.html',
  styleUrls: ['./create-user-account.component.css']
})
export class CreateUserAccountComponent implements OnInit {
  submitted = false;
  registerUserRequest!: RegisterUserRequest;
  userSessionDetails: userSessionDetails | null | undefined;
  frmValidate: FormGroup;
  registerUserRequestSubscription?: Subscription;
  modalDisplayStyle = "none";
  userMessage = "";

  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {
    this.frmValidate = this.fv.group({
      firstName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      middleName: ['', [Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      lastName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      gender: ['', [Validators.required]],
      dateOfBirth: ['', [Validators.required]],
      address: ['', [Validators.required, Validators.minLength(3)]],
      city: ['', [Validators.required]],
      pinCode: ['', [Validators.required, Validators.minLength(6), Validators.pattern('[0-9]*')]],
      mobileNumber: ['', [Validators.required, Validators.minLength(10), Validators.pattern('[0-9]*')]],
      email: ['', [Validators.required, Validators.email]],
      password: ['qwerty', [Validators.minLength(3)]],
      createdBy: ['', Validators.required], // Set dynamically from session
      folderName: [''], // Set dynamically to email
      userType: [5], // Default to 5 for normal/end user
      corpoName: ['none'],
      branch: ['none'],
      landlineNumber: ['0000000000'],
      cloudProvider: ['', Validators.required] // Added cloudProvider from session
    });
  }

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    if (!this.userSessionDetails?.username || !this.userSessionDetails.cloudProvider) {
      console.error("No logged-in user or cloud provider found in session!");
      this.userMessage = "Please log in with a valid user to create a user.";
      this.modalDisplayStyle = "block";
      return;
    }
    this.frmValidate.patchValue({
      createdBy: this.userSessionDetails.username, // Creator's email
      cloudProvider: this.userSessionDetails.cloudProvider // Creator's cloud provider
    });
    console.log('Logged-in user details set - createdBy:', this.userSessionDetails.username, 
                'cloudProvider:', this.userSessionDetails.cloudProvider);
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onCreateUserAccount() {
    this.submitted = true;
    if (this.frmValidate.invalid) {
      console.log('Form is invalid:', this.frmValidate.errors);
      return;
    }

    this.registerUserRequest = this.frmValidate.value as RegisterUserRequest;
    this.registerUserRequest.folderName = this.registerUserRequest.email;

    console.log('Submitting to backend:', this.registerUserRequest);
    this.registerUserRequestSubscription = this.authService.registerUser(this.registerUserRequest)
      .subscribe(
        (response) => {
          console.log('Success response:', response);
          this.userMessage = "User registered successfully!";
          this.modalDisplayStyle = "block";
          this.onReset();
        },
        (error) => {
          console.error('Error response:', error.status, error.error);
          this.userMessage = error.error?.message || "User already exists or OneDrive folder creation failed.";
          this.modalDisplayStyle = "block";
        }
      );
  }

  onReset(): void {
    this.submitted = false;
    this.frmValidate.reset();
    this.frmValidate.patchValue({
      createdBy: this.userSessionDetails?.username,
      cloudProvider: this.userSessionDetails?.cloudProvider,
      userType: 5,
      corpoName: 'none',
      branch: 'none',
      landlineNumber: '0000000000'
    });
  }

  ngOnDestroy(): void {
    this.registerUserRequestSubscription?.unsubscribe();
  }

  closeModel(): void {
    this.modalDisplayStyle = "none";
    this.redirectToCorpList();
  }

  redirectToCorpList(): void {
    this.router.navigate(['useraccount']);
  }
}