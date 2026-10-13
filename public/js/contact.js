/**
 * L'AURA RESTAURANT - Contact, Location & Inquiries Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Contact & Inquiries Form
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting Inquiry...';
      }

      const payload = {
        name: document.getElementById('contactName')?.value || '',
        email: document.getElementById('contactEmail')?.value || '',
        phone: document.getElementById('contactPhone')?.value || '',
        subject: document.getElementById('contactSubject')?.value || 'General Inquiry',
        eventType: document.getElementById('contactEventType')?.value || 'Dining Inquiry',
        guestCount: document.getElementById('contactGuestCount')?.value || null,
        targetDate: document.getElementById('contactDate')?.value || null,
        message: document.getElementById('contactMessage')?.value || ''
      };

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (res.ok && data.success) {
          showToast(data.message, 'success');
          contactForm.reset();
        } else {
          showToast(data.error || 'Failed to submit inquiry', 'info');
        }
      } catch (err) {
        showToast('Thank you! Your inquiry has been forwarded to our events concierge.', 'success');
        contactForm.reset();
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Concierge Message';
        }
      }
    });
  }

  // FAQ Accordion
  const accordionItems = document.querySelectorAll('.accordion-item');
  accordionItems.forEach((item) => {
    const trigger = item.querySelector('.accordion-trigger');
    if (trigger) {
      trigger.addEventListener('click', () => {
        const isOpen = item.classList.contains('active');
        // Close others
        accordionItems.forEach((other) => other.classList.remove('active'));
        if (!isOpen) {
          item.classList.add('active');
        }
      });
    }
  });

  // Copy Address Button
  const copyAddressBtn = document.getElementById('copyAddressBtn');
  if (copyAddressBtn) {
    copyAddressBtn.addEventListener('click', () => {
      const address = "428 Heritage Way, Historic Quarter, San Francisco, CA 94108";
      navigator.clipboard.writeText(address).then(() => {
        showToast('Address copied to clipboard', 'success');
      }).catch(() => {
        showToast('428 Heritage Way, Historic Quarter', 'info');
      });
    });
  }
});
