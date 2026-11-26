/**
 * /mod/verifications: what a valid student document looks like, so a moderator knows what to compare with. A drawn sample with
 * made-up data and a «ЗРАЗОК» stamp, not a copy of any real document. The checklist beside it is what the moderator verifies.
 */
export function SampleStudentCard() {
  return (
    <section className="sample-check" aria-labelledby="sample-title">
      <h2 id="sample-title">Що перевіряти</h2>
      <div className="sample-check__grid">
        <figure className="student-card" aria-label="Зразок студентського квитка з вигаданими даними">
          <div className="student-card__top">
            <span className="student-card__org">Студентський квиток</span>
            <span className="student-card__uni">Назва університету</span>
          </div>
          <div className="student-card__body">
            <div className="student-card__photo" aria-hidden="true">
              <svg viewBox="0 0 48 56" width="48" height="56">
                <circle cx="24" cy="19" r="10" fill="currentColor" opacity="0.55" />
                <path d="M6 54c2-12 10-18 18-18s16 6 18 18z" fill="currentColor" opacity="0.55" />
              </svg>
            </div>
            <dl className="student-card__fields">
              <div>
                <dt>Прізвище, ім’я</dt>
                <dd>Іваненко Олена</dd>
              </div>
              <div>
                <dt>Факультет</dt>
                <dd>Інформатики</dd>
              </div>
              <div>
                <dt>Форма, курс</dt>
                <dd>Денна, 2 курс</dd>
              </div>
              <div>
                <dt>Дійсний до</dt>
                <dd>30.06.2027</dd>
              </div>
            </dl>
          </div>
          <div className="student-card__bottom">
            <span>№ 00000000</span>
            <span className="student-card__stamp">Зразок</span>
          </div>
          <figcaption className="visually-hidden">Вигадані дані, лише для прикладу.</figcaption>
        </figure>
        <ol className="sample-check__list">
          <li>Ім’я на документі збігається з іменем у профілі студента.</li>
          <li>Документ чинний: «Дійсний до» ще не минуло, або є довідка про навчання цього року.</li>
          <li>Видно назву закладу, і вона збігається з доменом пошти студента.</li>
          <li>Фото, номер і печатка не замальовані й не змонтовані.</li>
          <li>Якщо щось не так, відхиліть і напишіть, що саме переробити.</li>
        </ol>
      </div>
    </section>
  );
}
