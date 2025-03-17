import { Component, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { RegisterUserRequest } from 'src/app/models/register-user-request.model';
import { userSessionDetails } from 'src/app/models/user-session-responce.model';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-personal-information',
  templateUrl: './create-corporate-account.component.html',
  styleUrls: ['./create-corporate-account.component.css']
})
export class CreateCorporateAccountComponent implements OnInit {
  submitted = false;
  registerUserRequest!: RegisterUserRequest;
  userSessionDetails: userSessionDetails | null | undefined;
  frmValidate: FormGroup;
  registerUserRequestubscription?: Subscription;
  modalDisplayStyle = "none";
  userMessage = "";

  constructor(private authService: AuthService, private fv: FormBuilder, private router: Router) {
    this.frmValidate = fv.group({
      firstName: ['none', [Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      middleName: ['none', [Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      lastName: ['none', [Validators.minLength(3), Validators.pattern('^[a-zA-Z]+$')]],
      gender: ['none'],
      dateOfBirth: ['01-01-2000'],
      address: ['', [Validators.required, Validators.minLength(3)]],
      city: ['none'],
      pinCode: ['', [Validators.required, Validators.minLength(6), Validators.pattern('[0-9]*')]],
      mobileNumber: ['0000000000', [Validators.minLength(10), Validators.pattern('[0-9]*')]],
      email: ['', [Validators.required, Validators.email]],
      corpoName: ['', [Validators.required, Validators.minLength(3)]],
      branch: ['', [Validators.required, Validators.minLength(3)]],
      landlineNumber: ['', [Validators.required, Validators.minLength(10), Validators.pattern('[0-9]*')]],
      userType: [this.userSessionDetails?.userType || 3],
      password: ['qwerty', [Validators.minLength(3)]],
      // Added OneDrive fields
      oneDriveUserId: ['', [Validators.maxLength(250)]],
      onedriveUsername: ['', [Validators.maxLength(250)]],
      onedrivePassword: ['', [Validators.maxLength(250)]],
      onedriveTenantId: ['', [Validators.maxLength(250)]],
      onedriveClientId: ['', [Validators.maxLength(250)]],
      clientSecret: ['', [Validators.maxLength(250)]]
    });
  }

  ngOnInit(): void {
    this.userSessionDetails = this.authService.getLoggedInUserDetails();
  }

  get f(): { [key: string]: AbstractControl } {
    return this.frmValidate.controls;
  }

  onCreateCoprporateAccount() {
    this.submitted = true;
    this.registerUserRequest = this.frmValidate.value as RegisterUserRequest;
    this.registerUserRequest.userType = 3;
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
            this.userMessage = "User already exists, Please try with different email and Number";
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
    this.router.navigate(['corporateaccount']);
  }
}