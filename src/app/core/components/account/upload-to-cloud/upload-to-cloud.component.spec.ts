import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UploadToCloudComponent } from './upload-to-cloud.component';

describe('UploadToCloudComponent', () => {
  let component: UploadToCloudComponent;
  let fixture: ComponentFixture<UploadToCloudComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [UploadToCloudComponent]
    });
    fixture = TestBed.createComponent(UploadToCloudComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
