import { TestBed } from '@angular/core/testing';

import { SuperAdminService } from './super-admin.service';
import { HTTP_SERVICE_TEST_IMPORTS } from 'src/testing/shallow-test-setup';

describe('SuperAdminService', () => {
  let service: SuperAdminService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: HTTP_SERVICE_TEST_IMPORTS
    });
    service = TestBed.inject(SuperAdminService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
