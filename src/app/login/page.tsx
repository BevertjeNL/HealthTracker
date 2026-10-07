import { LoginForm } from "@/app/login/LoginForm";
import { AppLogo } from "@/components/AppLogo";

export default function LoginPage() {
  return <main className="c-login-shell"><section className="c-login-intro"><div className="brand-mark"><AppLogo /></div><span className="c-overline">JOUW PERSOONLIJKE HARDLOOPCOACH</span><h1>Loop met meer<br /><em>richting.</em></h1><p>Inzichten uit je Strava-runs en Apple Health, vertaald naar een stap die vandaag bij je past.</p><div className="c-login-source">STRAVA <span>×</span> APPLE HEALTH</div></section><section className="c-login-form"><span className="c-overline">WELKOM TERUG</span><h2>Log in bij Pulse.</h2><p>Je trainings- en gezondheidsgegevens zijn privé.</p><LoginForm /></section></main>;
}
