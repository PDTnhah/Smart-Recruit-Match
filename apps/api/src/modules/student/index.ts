// Public entry of the student module (CONTEXT D22): other code imports only from here.
export { StudentModule } from './student.module.js';
export { StudentService, type NewStudent } from './application/student.service.js';
export { ConsentService } from './application/consent.service.js';
export { CvService } from './application/cv.service.js';
export { CV_SUBMITTED, type CvSubmittedEvent } from './domain/events.js';
