import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';

export const SHALLOW_COMPONENT_TEST_IMPORTS = [
  HttpClientTestingModule,
  FormsModule,
  ReactiveFormsModule,
  RouterTestingModule
];

export const SHALLOW_COMPONENT_TEST_SCHEMAS = [NO_ERRORS_SCHEMA];

export const HTTP_SERVICE_TEST_IMPORTS = [HttpClientTestingModule];
