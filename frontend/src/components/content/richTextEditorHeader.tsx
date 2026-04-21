export const richTextEditorHeader = (
  <span className="ql-formats">
    <button type="button" className="ql-bold" aria-label="Bold" />
    <button type="button" className="ql-italic" aria-label="Italic" />
    <button type="button" className="ql-underline" aria-label="Underline" />
    <button type="button" className="ql-list" value="bullet" aria-label="Bullet list" />
    <button type="button" className="ql-list" value="ordered" aria-label="Ordered list" />
    <button type="button" className="ql-list" value="check" aria-label="Checklist">
      <svg viewBox="0 0 18 18">
        <rect className="ql-stroke" x="1.5" y="3.5" width="6" height="6" rx="1" />
        <path className="ql-stroke" d="M3.5 6.5 5 8l2.5-3" />
        <line className="ql-stroke" x1="10" y1="5.5" x2="16.5" y2="5.5" />
        <line className="ql-stroke" x1="10" y1="9.5" x2="16.5" y2="9.5" />
      </svg>
    </button>
  </span>
);
