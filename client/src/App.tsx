import { useEffect, useState } from "react";
import { getServerHealth } from "./services/api";
import "./App.css";

function App() {
  const [serverStatus, setServerStatus] = useState("Checking...");

  useEffect(() => {
    let active = true;

    getServerHealth()
      .then((data) => {
        if (active) {
          setServerStatus(data.status === "ok" ? "Online" : "Unavailable");
        }
      })
      .catch(() => {
        if (active) {
          setServerStatus("Offline");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app">
      <h1>QuickPoll</h1>
      <p>Real-time interactive polling platform</p>

      <section className="server-status">
        <h2>Server Status</h2>
        <p>{serverStatus}</p>
      </section>
    </main>
  );
}

export default App;