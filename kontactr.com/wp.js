document.write('<div id="kontactr_div"></div>');
			
var xhr = new XMLHttpRequest();
xhr.open('GET', "https://kontactr.com/getMigratedFormSlugFromUserId?user_id=" + id);
xhr.onload = function() {
	if (xhr.status === 200) {
		slug = xhr.responseText;
		(function() {
			var po = document.createElement('div'); po.setAttribute('data-embed-src', 'https://kontactr.com/form/' + slug);
			var s = document.getElementById('kontactr_div'); s.parentNode.insertBefore(po, s);
	
			var po = document.createElement('script'); po.type = 'text/javascript'; po.async = true;
			po.src = '../d3vxmrleduyji.cloudfront.net/js/e.js';
			//po.src = 'https://kontactr.com/js/e.js';
			var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(po, s);
		})();
	}
	else {
			       
	}
};
xhr.send();


