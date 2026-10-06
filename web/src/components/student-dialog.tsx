"use client";

import { FormEvent, useEffect, useState } from "react";
import { Customer, Data } from "@/lib/domain";
import { StudentRole, enrollmentCandidates, gradeOptions, studentName, studentsOn } from "@/lib/students";

type Draft = {
  id: string;
  reference_code: string;
  student_name: string;
  school: string;
  grade: string;
  previous_academy: string;
  monthly_fee: string;
  consulted_on: string;
  level_test_on: string | null;
  enrolled_on: string | null;
  deleted: boolean;
  isNew: boolean;
  touched: boolean;
};

const fromCustomer = (c: Customer): Draft => ({
  id: c.id,
  reference_code: c.reference_code,
  student_name: c.student_name ?? "",
  school: c.school ?? "",
  grade: c.grade ?? "",
  previous_academy: c.previous_academy ?? "",
  monthly_fee: c.monthly_fee == null ? "" : String(c.monthly_fee),
  consulted_on: c.consulted_on,
  level_test_on: c.level_test_on ?? null,
  enrolled_on: c.enrolled_on,
  deleted: false,
  isNew: false,
  touched: false,
});

const newDraft = (date: string, role: StudentRole): Draft => {
  const id = crypto.randomUUID();
  return {
    id,
    reference_code: `S-${date.replaceAll("-", "")}-${id.slice(0, 6)}`,
    student_name: "",
    school: "",
    grade: "",
    previous_academy: "",
    monthly_fee: "",
    consulted_on: date,
    level_test_on: role === "level_tests" ? date : null,
    enrolled_on: role === "enrollments" ? date : null,
    deleted: false,
    isNew: true,
    touched: true,
  };
};

/**
 * Student list behind a 레벨테스트 / 신규 등록 day cell. Saving stores the
 * students and sets the cell to the number of students on that day.
 */
export function StudentDialog({
  data,
  role,
  date,
  metricName,
  onSave,
  onClose,
}: {
  data: Data;
  role: StudentRole;
  date: string;
  metricName: string;
  onSave: (students: Record<string, unknown>[]) => Promise<void>;
  onClose: () => void;
}) {
  const enrolling = role === "enrollments";
  const [rows, setRows] = useState<Draft[]>(() => {
    const existing = studentsOn(data.customers, role, date).map(fromCustomer);
    return existing.length ? existing : [newDraft(date, role)];
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const shown = rows.filter((row) => !row.deleted && (enrolling ? row.enrolled_on === date : row.level_test_on === date));
  const listedIds = new Set(rows.map((row) => row.id));
  const candidates = enrolling ? enrollmentCandidates(data.customers).filter((c) => !listedIds.has(c.id)) : [];
  const update = (id: string, patch: Partial<Draft>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch, touched: true } : row)));
  const remove = (row: Draft) => {
    if (row.isNew) {
      setRows((current) => current.filter((item) => item.id !== row.id));
      return;
    }
    // Keep a student who still belongs to the other list; otherwise move to trash.
    if (enrolling) update(row.id, { enrolled_on: null, deleted: !row.level_test_on });
    else update(row.id, { level_test_on: null, deleted: !row.enrolled_on });
  };
  const enrollCandidate = (c: Customer) =>
    setRows((current) => [...current, { ...fromCustomer(c), enrolled_on: date, touched: true }]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const changed = rows.filter((row) => row.touched);
    const missingName = changed.find((row) => !row.deleted && !row.student_name.trim());
    if (missingName) {
      setError("학생 이름을 입력하세요. 필요 없는 줄은 ✕로 빼 주세요.");
      return;
    }
    const early = changed.find((row) => !row.deleted && row.enrolled_on && row.enrolled_on < row.consulted_on);
    if (early) {
      setError(`${early.student_name}: 등록일이 레벨테스트·상담일(${early.consulted_on})보다 빠릅니다.`);
      return;
    }
    const badFee = changed.find((row) => row.monthly_fee.trim() !== "" && !(Number(row.monthly_fee) >= 0));
    if (badFee) {
      setError(`${badFee.student_name}: 월 수강료는 0 이상의 숫자로 입력하세요.`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(
        changed.map((row) => ({
          id: row.id,
          reference_code: row.reference_code,
          student_name: row.student_name.trim(),
          school: row.school,
          grade: row.grade,
          previous_academy: row.previous_academy,
          monthly_fee: row.monthly_fee.trim() === "" ? null : Number(row.monthly_fee),
          consulted_on: row.consulted_on,
          level_test_on: row.level_test_on,
          enrolled_on: row.enrolled_on,
          deleted: row.deleted,
        })),
      );
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="editor student-dialog" onSubmit={(event) => void submit(event)}>
        <header>
          <div>
            <small>{metricName} · {date}</small>
            <h2>{enrolling ? "등록 학생" : "레벨테스트 학생"}</h2>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>✕</button>
        </header>
        <p className="form-note">
          {enrolling
            ? "이 날 등록한 학생입니다. 이전 학원과 월 수강료는 근속·장기 수익성 분석에 쓰입니다. 저장하면 이 날 ‘신규 등록’ 칸이 명단 인원으로 바뀝니다."
            : "이 날 레벨테스트를 본 학생입니다. 저장하면 이 날 ‘레벨테스트’ 칸이 명단 인원으로 바뀝니다."}
        </p>
        <datalist id="student-grades">
          {gradeOptions.map((grade) => <option key={grade} value={grade} />)}
        </datalist>
        <div className={`student-rows${enrolling ? " enrolling" : ""}`}>
          <div className="student-row student-row-head" aria-hidden="true">
            <span>이름</span>
            <span>학교</span>
            <span>학년</span>
            {enrolling && <span>이전 학원</span>}
            {enrolling && <span>월 수강료(원)</span>}
            <span />
          </div>
          {shown.map((row) => (
            <div className="student-row" key={row.id}>
              <input
                aria-label="학생 이름"
                placeholder="이름"
                value={row.student_name}
                autoFocus={row.isNew && row === shown[shown.length - 1]}
                onChange={(event) => update(row.id, { student_name: event.target.value })}
              />
              <input aria-label="학교" placeholder="예: 풍무중" value={row.school} onChange={(event) => update(row.id, { school: event.target.value })} />
              <input aria-label="학년" placeholder="예: 중2" list="student-grades" value={row.grade} onChange={(event) => update(row.id, { grade: event.target.value })} />
              {enrolling && (
                <input aria-label="이전 학원" placeholder="없으면 비움" value={row.previous_academy} onChange={(event) => update(row.id, { previous_academy: event.target.value })} />
              )}
              {enrolling && (
                <input aria-label="월 수강료" type="number" min={0} step={1000} placeholder="예: 250000" value={row.monthly_fee} onChange={(event) => update(row.id, { monthly_fee: event.target.value })} />
              )}
              <button type="button" className="student-remove" aria-label={`${row.student_name || "학생"} ${enrolling ? "등록 취소" : "명단에서 빼기"}`} onClick={() => remove(row)}>✕</button>
            </div>
          ))}
          {!shown.length && <p className="empty-small">명단이 비어 있습니다. 저장하면 이 날 칸이 비워집니다.</p>}
        </div>
        <div className="student-actions">
          <button type="button" onClick={() => setRows((current) => [...current, newDraft(date, role)])}>
            {enrolling ? "＋ 레벨테스트 없이 등록" : "＋ 학생 추가"}
          </button>
        </div>
        {enrolling && candidates.length > 0 && (
          <section className="student-candidates">
            <strong>레벨테스트 본 학생에서 등록</strong>
            {candidates.slice(0, 30).map((c) => (
              <div key={c.id} className="student-candidate">
                <span>
                  <b>{studentName(c)}</b>
                  <small>{[c.school, c.grade, `레벨테스트 ${c.level_test_on}`].filter(Boolean).join(" · ")}</small>
                </span>
                <button type="button" onClick={() => enrollCandidate(c)}>등록</button>
              </div>
            ))}
          </section>
        )}
        {error && <p className="flow-error" role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>취소</button>
          <button className="primary" type="submit" disabled={saving}>{saving ? "저장 중…" : "저장"}</button>
        </footer>
      </form>
    </div>
  );
}
