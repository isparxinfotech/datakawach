import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LabDetailsComponent } from './lab-details.component';

describe('LabDetailsComponent', () => {
  let component: LabDetailsComponent;
  let fixture: ComponentFixture<LabDetailsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [LabDetailsComponent]
    });
    fixture = TestBed.createComponent(LabDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
