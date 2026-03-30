import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataAiComponent } from './data-ai.component';

describe('DataAiComponent', () => {
  let component: DataAiComponent;
  let fixture: ComponentFixture<DataAiComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [DataAiComponent]
    });
    fixture = TestBed.createComponent(DataAiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
