export default function Home() {
  return (
    <main className="shell">
      <nav><strong>CampusConnect</strong><span>Student social network</span></nav>
      <section className="hero">
        <p className="eyebrow">YOUR CAMPUS. YOUR COMMUNITY.</p>
        <h1>Connect with the people, communities and opportunities around you.</h1>
        <p>Share updates, find classmates, join communities, message friends and discover campus life.</p>
        <div className="actions"><a href="/login">Sign in</a><a className="secondary" href="/register">Join CampusConnect</a></div>
      </section>
    </main>
  );
}
