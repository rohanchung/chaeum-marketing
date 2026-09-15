"use client";
import { useState } from "react";
import { updateHistory } from "@/lib/update-history";

export function UpdateLog() {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const entries = updateHistory.filter((entry) =>
    [entry.date, entry.title, entry.room, ...entry.changes]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search),
  );
  return (
    <section className="panel update-log" aria-labelledby="update-log-title">
      <div className="section-toolbar">
        <div>
          <h1 id="update-log-title">업데이트 로그</h1>
          <p className="form-note">
            기능 업데이트와 개선 이력을 최신순으로 기록합니다.
          </p>
        </div>
        <label className="log-search">
          이력 검색
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="키워드, 당근, 구매…"
          />
        </label>
      </div>
      <p className="form-note" role="status">
        {entries.length}건{search ? " 검색됨" : "의 업데이트"}
      </p>
      <ol className="update-log-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <details
              open={
                search || entry.id === updateHistory[0].id ? true : undefined
              }
            >
              <summary>
                <time dateTime={entry.date}>{entry.date}</time>
                <strong>{entry.title}</strong>
                <span>{entry.room}</span>
              </summary>
              <ul>
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
      {!entries.length && <p>검색어에 맞는 업데이트가 없습니다.</p>}
    </section>
  );
}
