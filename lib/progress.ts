import { initialLesson, type Lesson, type Note } from './practice.ts';
export type State = {
  version: 1;
  step: number;
  person: number;
  notes: Note[];
  instruction: string;
  lesson: Lesson;
  report: string;
  saved: boolean;
  draftQuestion: string;
  nextPlan: string;
  mode: 'live' | 'scripted';
};
export const fresh: State = {
  version: 1,
  step: 0,
  person: 0,
  notes: [],
  instruction: '',
  lesson: initialLesson,
  report: '',
  saved: false,
  draftQuestion: '',
  nextPlan: '',
  mode: 'live',
};
export function restoreProgress(raw: string): State {
  const s = JSON.parse(raw);
  if (
    !s ||
    s.version !== 1 ||
    !Number.isInteger(s.step) ||
    s.step < 0 ||
    s.step > 4 ||
    !Number.isInteger(s.person) ||
    s.person < 0 ||
    s.person > 2 ||
    !Array.isArray(s.notes) ||
    s.notes.length > 18
  )
    throw new Error('进度格式无效');
  for (const note of s.notes)
    if (
      !note ||
      !Number.isInteger(note.person) ||
      note.person < 0 ||
      note.person > 2 ||
      !['question', 'answer', 'label'].every((k) => typeof note[k] === 'string')
    )
      throw new Error('笔记无效');
  for (const key of ['instruction', 'report'])
    if (typeof s[key] !== 'string') throw new Error('进度格式无效');
  for (const key of ['draftQuestion', 'nextPlan'])
    if (s[key] !== undefined && typeof s[key] !== 'string')
      throw new Error('草稿无效');
  if (
    !s.lesson ||
    typeof s.lesson.e1 !== 'boolean' ||
    typeof s.lesson.e2 !== 'boolean' ||
    !['feedback', 'e1Quote', 'e2Quote'].every(
      (k) => typeof s.lesson[k] === 'string',
    )
  )
    throw new Error('指导结果无效');
  return {
    ...fresh,
    ...s,
    mode: s.mode === 'scripted' ? 'scripted' : 'live',
    saved: s.saved === true,
  };
}
export function canConfirm(s: State) {
  return (
    s.step === 4 &&
    !!s.report.trim() &&
    s.nextPlan.trim().length >= 5 &&
    (s.lesson.e1 || s.lesson.e2)
  );
}
