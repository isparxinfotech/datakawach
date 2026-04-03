import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadToCloudComponent } from './upload-to-cloud.component';
import {
  SHALLOW_COMPONENT_TEST_IMPORTS,
  SHALLOW_COMPONENT_TEST_SCHEMAS
} from 'src/testing/shallow-test-setup';

describe('UploadToCloudComponent', () => {
  let component: UploadToCloudComponent;
  let fixture: ComponentFixture<UploadToCloudComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UploadToCloudComponent],
      imports: SHALLOW_COMPONENT_TEST_IMPORTS,
      schemas: SHALLOW_COMPONENT_TEST_SCHEMAS
    });
    fixture = TestBed.createComponent(UploadToCloudComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
