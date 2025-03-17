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
  registerUserRequestubscription?: Subscription;
  modalDisplayStyle = "none";
  userMessage = "";

  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {
    this.frmValidate = fv.group({
      firstName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      middleName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      lastName: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      gender: ['', [Validators.required]],
      dateOfBirth: ['', [Validators.required]],
      address: ['', [Validators.required, Validators.minLength(3)]],
      city: ['', [Validators.required]],
      pinCode: ['', [Validators.required, Validators.minLength(6), Validators.pattern('[0-9]*')]],
      mobileNumber: ['', [Validators.required, Validators.minLength(10), Validators.pattern('[0-9]*')]],
      email: ['', [Validators.required, Validators.email]],
      confirmPwd: [''],
      isTermsAndCondtionAccepted: [''],
      corpoName: ['none'],
      branch: ['none'],
      landlineNumber: ['0000000000'],
      userType: [5], // Default to 5 for normal/end user
      password: ['qwerty', [Validators.minLength(3)]],
      createdBy: [this.userSessionDetails?.username],
      oneDriveUserId: ['default-user-id'], // Replace with actual default or input
      onedriveUsername: ['default-username'], // Replace with actual default or input
      onedrivePassword: ['default-password'], // Replace with actual default or input
      onedriveTenantId: ['default-tenant-id'], // Replace with actual default or input
      onedriveClientId: ['default-client-id'], // Replace with actual default or input
      clientSecret: ['default-client-secret'], // Replace with actual default or input
      folderName: [''] // Will be set to email dynamically
    });
  }

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
    this.frmValidate.patchValue({
      createdBy: this.userSessionDetails?.username
    });
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onCreateUserAccount() {
    this.submitted = true;
    this.registerUserRequest = this.frmValidate.value as RegisterUserRequest;

    // Set folderName to email before submission
    this.registerUserRequest.folderName = this.registerUserRequest.email;
    this.registerUserRequest.userType = 5;
    this.registerUserRequest.corpoName = 'none';
    this.registerUserRequest.landlineNumber = '0000000000';
    this.registerUserRequest.branch = 'none';

    if (this.frmValidate.valid) {
      console.log('Form submitted:', this.registerUserRequest);
      this.registerUserRequestubscription = this.authService.registerUser(this.registerUserRequest)
        .subscribe(
          (response) => {
            console.log(response);
            this.userMessage = "";
            this.modalDisplayStyle = "block";
            this.onReset();
          },
          (error) => {
            console.log(Object.assign(error));
            this.modalDisplayStyle = "block";
            this.userMessage = error.error?.message || "User already exists or OneDrive folder creation failed.";
          }
        );
    } else {
      console.log('Form is invalid');
      console.log(JSON.stringify(this.frmValidate.value));
    }
  }

  onReset(): void {
    this.submitted = false;
    this.frmValidate.reset();
  }

  ngOnDestroy(): void {
    this.registerUserRequestubscription?.unsubscribe();
  }

  closeModel(): void {
    this.modalDisplayStyle = "none";
    this.redirectToCorpList();
  }

  OpenModel(): void {
    this.onReset();
    this.modalDisplayStyle = "block";
  }

  redirectToCorpList(): void {
    this.router.navigate(['useraccount']);
  }
}