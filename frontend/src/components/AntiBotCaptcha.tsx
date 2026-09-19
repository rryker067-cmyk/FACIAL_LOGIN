import { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';

interface AntiBotProps {
  onVerified: (status: boolean) => void;
}

export default function AntiBotCaptcha({ onVerified }: AntiBotProps) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState(false);

  const generateCaptcha = () => {
    setNum1(Math.floor(Math.random() * 10) + 1);
    setNum2(Math.floor(Math.random() * 10) + 1);
    setUserAnswer('');
    setIsVerified(false);
    onVerified(false);
    setError(false);
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  const handleVerify = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUserAnswer(val);
    
    if (parseInt(val, 10) === num1 + num2) {
      setIsVerified(true);
      setError(false);
      onVerified(true);
    } else {
      setIsVerified(false);
      onVerified(false);
      if (val.length >= 2) setError(true);
    }
  };

  return (
    <div className="antibot-box">
      <div className="antibot-header">
        <span className="antibot-title-text">
          <ShieldAlert size={14} className="antibot-icon-warn" /> Verificación Anti-Bot
        </span>
        <button 
          type="button" 
          onClick={generateCaptcha}
          className="antibot-refresh-btn"
          title="Cambiar operación"
        >
          <RefreshCw size={12} /> Cambiar
        </button>
      </div>
      
      <div className="antibot-body">
        <div className="antibot-math" aria-label={`Resuelve ${num1} más ${num2}`}>
          {num1} + {num2} = ?
        </div>
        <input 
          aria-label="Resultado de la verificación anti-bot"
          type="number" 
          value={userAnswer}
          onChange={handleVerify}
          placeholder="Resultado"
          className="antibot-input"
        />
        <div className="antibot-status-icon">
          {isVerified ? (
            <CheckCircle2 size={18} className="antibot-success" />
          ) : error ? (
            <span className="antibot-error-text">Error</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}