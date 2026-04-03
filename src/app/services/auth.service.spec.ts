import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { HTTP_SERVICE_TEST_IMPORTS } from 'src/testing/shallow-test-setup';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: HTTP_SERVICE_TEST_IMPORTS
    });
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
