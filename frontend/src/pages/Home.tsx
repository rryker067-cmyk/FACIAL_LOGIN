import React, { useEffect, useState } from 'react';
import { ShieldCheck, ScanFace, Lock, Cpu, ArrowRight, Activity, Zap, CheckCircle, Terminal, Menu, X } from 'lucide-react';
import './Home.css';

interface HomeProps {
  onGoToLogin: () => void;
}

export default function Home({ onGoToLogin }: HomeProps) {
  // Efecto dinámico de scroll para mover elementos de fondo suavemente
  const [scrollY, setScrollY] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="home-container">
      
      {/* Fondo con gradientes flotantes interactivos que responden al scroll */}
      <div 
        className="dynamic-bg-glow"
        style={{
          transform: `translateY(${scrollY * 0.3}px)`,
          opacity: Math.max(0.2, 1 - scrollY / 700)
        }}
      />

      {/* Barra de navegación superior minimalista */}
      <nav className="home-nav">
        <div className="home-logo">
          <ShieldCheck className="text-emerald-400" size={24} />
          <span>VERIS<span className="logo-badge">ID</span></span>
        </div>
        <div className={`nav-links ${mobileMenuOpen ? 'nav-links--open' : ''}`}>
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Características</a>
          <a href="#stats" onClick={() => setMobileMenuOpen(false)}>Métricas</a>
          <a href="#tech" onClick={() => setMobileMenuOpen(false)}>Stack</a>
          <a href="#security" onClick={() => setMobileMenuOpen(false)}>Seguridad</a>
        </div>
        <button type="button" onClick={onGoToLogin} className="home-login-nav-btn" aria-label="Iniciar sesión">
          Iniciar Sesión <ArrowRight size={14} />
        </button>
        <button type="button" className="home-menu-btn" aria-label={mobileMenuOpen ? 'Cerrar navegación' : 'Abrir navegación'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((current) => !current)}>
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      {/* Sección Hero principal estilo Apple */}
      <header className="home-hero">
        <div className="hero-badge">
          <Zap size={14} className="text-emerald-400" />
          <span>Tecnología de Autenticación de Próxima Generación</span>
        </div>
        <h1>Identidad digital fluida.<br /><span>Protección sin fricciones.</span></h1>
        <p>
          Una plataforma corporativa para gestionar accesos mediante reconocimiento facial, controles de seguridad y trazabilidad operativa en tiempo real.
        </p>
        <div className="hero-actions">
          <button type="button" onClick={onGoToLogin} className="hero-btn-primary">
            Acceder al Sistema <ArrowRight size={16} />
          </button>
          <a href="#features" className="hero-btn-secondary">Explorar Funciones</a>
        </div>

        {/* Imagen de cabecera con efecto de perspectiva flotante */}
        <div className="hero-preview-window">
          <div className="window-bar">
            <span className="dot red"></span>
            <span className="dot yellow"></span>
            <span className="dot green"></span>
            <span className="window-title">veris-security-core.tsx</span>
          </div>
          <div className="window-content">
            <img 
              src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&auto=format&fit=crop&q=80" 
              alt="Dashboard Preview" 
              onError={(event) => { event.currentTarget.style.display = 'none' }}
            />
          </div>
        </div>
      </header>

      {/* Sección de Métricas / Contenido de Relleno */}
      <section className="stats-section" id="stats">
        <div className="stats-grid">
          <div className="stat-card">
            <h3>99.9%</h3>
            <p>Precisión Biométrica</p>
          </div>
          <div className="stat-card">
            <h3>&lt; 0.4s</h3>
            <p>Tiempo de Validación</p>
          </div>
          <div className="stat-card">
            <h3>256-bit</h3>
            <p>Cifrado Local Activo</p>
          </div>
          <div className="stat-card">
            <h3>0%</h3>
            <p>Fricción en Accesos</p>
          </div>
        </div>
      </section>

      {/* Sección de Cuadros de Relleno (Bento Grid avanzado) */}
      <section className="bento-section" id="features">
        <div className="section-title-wrapper">
          <h2>Arquitectura Diseñada para el Rendimiento</h2>
          <p>Cada componente está optimizado para garantizar velocidad, seguridad y una experiencia visual de alta gama.</p>
        </div>

        <div className="bento-grid">
          
          {/* Tarjeta 1: Reconocimiento Facial (Destacada grande con imagen) */}
          <div className="bento-card bento-large">
            <div className="bento-content">
              <div className="bento-icon-box"><ScanFace size={24} /></div>
              <h3>Biometría Facial en Tiempo Real</h3>
              <p>Validación de identidad instantánea con algoritmos avanzados de detección de vivencia para prevenir suplantaciones y accesos no autorizados.</p>
            </div>
            <div className="bento-image-wrapper">
              <img 
                src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80" 
                alt="Biometría Avanzada" 
                onError={(event) => { event.currentTarget.style.display = 'none' }}
              />
            </div>
          </div>

          {/* Tarjeta 2: Cifrado Local */}
          <div className="bento-card">
            <div className="bento-icon-box"><Lock size={24} /></div>
            <h3>Seguridad Local First</h3>
            <p>Tus credenciales y datos operan bajo esquemas locales optimizados antes de conectar con servicios en la nube.</p>
          </div>

          {/* Tarjeta 3: Rendimiento */}
          <div className="bento-card">
            <div className="bento-icon-box"><Cpu size={24} /></div>
            <h3>Procesamiento Ultra Rápido</h3>
            <p>Construido con React, TypeScript y una interfaz optimizada para ofrecer transiciones fluidas y respuestas claras.</p>
          </div>

          {/* Tarjeta 4: Monitoreo */}
          <div className="bento-card bento-wide" id="security">
            <div className="bento-content">
              <div className="bento-icon-box"><Activity size={24} /></div>
              <h3>Control y Auditoría Total de Sesiones</h3>
              <p>Supervisa los accesos corporativos, roles de usuario y bitácoras de seguridad desde un panel centralizado e intuitivo adaptado a normativas internacionales.</p>
            </div>
            <div className="bento-image-wrapper-side">
              <img 
                src="https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80" 
                alt="Monitoreo de seguridad" 
                onError={(event) => { event.currentTarget.style.display = 'none' }}
              />
            </div>
          </div>

        </div>
      </section>

      {/* Sección estilo Logitech: "Descubrir la Tecnología" */}
      <section className="tech-series-section" id="tech">
        <div className="tech-series-header">
          <h2>EXPLORAR EL STACK TÉCNICO</h2>
        </div>

        <div className="tech-series-grid">
          
          {/* Tarjeta 1: Framework Core */}
          <div className="tech-series-card">
            <div className="tech-series-img">
              <img 
                src="https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=600&auto=format&fit=crop&q=80" 
                alt="React y TypeScript" 
                onError={(event) => { event.currentTarget.style.display = 'none' }}
              />
            </div>
            <div className="tech-series-info">
              <span className="series-tag">CORE FRAMEWORK</span>
              <h3>REACT & TYPESCRIPT</h3>
              <p>Base robusta basada en componentes tipados y altamente eficientes para la interfaz de usuario.</p>
              <span className="series-link">VER COMPONENTES &rarr;</span>
            </div>
          </div>

          {/* Tarjeta 2: Estilos y UI */}
          <div className="tech-series-card">
            <div className="tech-series-img">
              <img 
                src="https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&auto=format&fit=crop&q=80" 
                alt="Estilos y Diseño" 
                onError={(event) => { event.currentTarget.style.display = 'none' }}
              />
            </div>
            <div className="tech-series-info">
              <span className="series-tag">INTERFAZ & DISEÑO</span>
              <h3>CSS MODERNO & LUCIDE</h3>
              <p>Diseño visual inspirado en estándares de alta gama con iconografía vectorial limpia y fluida.</p>
              <span className="series-link">EXPLORAR DISEÑO &rarr;</span>
            </div>
          </div>

          {/* Tarjeta 3: Almacenamiento Local */}
          <div className="tech-series-card">
            <div className="tech-series-img">
              <img 
                src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80" 
                alt="Base de datos local" 
                onError={(event) => { event.currentTarget.style.display = 'none' }}
              />
            </div>
            <div className="tech-series-info">
              <span className="series-tag">PERSISTENCIA DE DATOS</span>
              <h3>LOCAL STORAGE & AUTH</h3>
              <p>Gestión segura de sesiones, roles y validación local optimizada sin fricciones externas.</p>
              <span className="series-link">VER LÓGICA &rarr;</span>
            </div>
          </div>

          {/* Tarjeta 4: Herramientas de Despliegue */}
          <div className="tech-series-card">
            <div className="tech-series-img">
              <img 
                src="https://images.unsplash.com/photo-1618401471353-b98aedd04e11?w=600&auto=format&fit=crop&q=80" 
                alt="Despliegue y Build" 
                onError={(event) => { event.currentTarget.style.display = 'none' }}
              />
            </div>
            <div className="tech-series-info">
              <span className="series-tag">INFRAESTRUCTURA</span>
              <h3>VITE & BUILD PIPELINE</h3>
              <p>Entorno de desarrollo ultrarrápido con empaquetado optimizado para producción.</p>
              <span className="series-link">VER CONFIGURACIÓN &rarr;</span>
            </div>
          </div>

        </div>
      </section>

      {/* Sección adicional de relleno: Características en Lista */}
      <section className="features-list-section">
        <div className="features-container">
          <div className="feature-text">
            <h2>Por qué las empresas eligen VerisID</h2>
            <p>Soluciones integrales de identidad pensadas para entornos corporativos exigentes.</p>
            
            <ul className="check-list">
              <li><CheckCircle size={18} className="text-emerald-400" /> Integración sencilla con sistemas existentes mediante componentes modulares.</li>
              <li><CheckCircle size={18} className="text-emerald-400" /> Protección anti-bot avanzada y validación de sesiones en tiempo real.</li>
              <li><CheckCircle size={18} className="text-emerald-400" /> Compatibilidad multiplataforma con diseño responsivo oscuro y elegante.</li>
            </ul>
          </div>
          <div className="feature-card-visual">
            <Terminal size={32} className="text-emerald-400 mb-4" />
            <h4>Entorno de Pruebas Local</h4>
            <p>Permite simular bases de datos locales y flujos de autenticación completos sin depender de infraestructura externa compleja.</p>
          </div>
        </div>
      </section>

      {/* Footer Minimalista */}
      <footer className="home-footer">
        <div className="footer-content">
          <div className="footer-logo">
            <ShieldCheck className="text-emerald-400" size={18} />
            <span>VerisID Systems</span>
          </div>
          <p>© 2026 Todos los derechos reservados. Diseñado bajo estándares de alta gama.</p>
        </div>
      </footer>
    </div>
  );
}